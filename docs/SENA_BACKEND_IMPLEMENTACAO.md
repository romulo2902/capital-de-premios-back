# Capital Sena — especificação de implementação (backend)

Documento de **build**: tudo que outra IA precisa para implementar o backend do
Capital Sena do zero, em NestJS + Prisma + PostgreSQL, sem acesso ao código de
referência.

- **Implementação de referência**: `src/modules/capital-sena/` + `prisma/schema.prisma` deste repositório.
- **Documento irmão**: `docs/CAPITAL_SENA.md` descreve o comportamento atual em prosa (leitura de apoio, não é spec).
- **Regras de estilo/arquitetura do projeto**: `CLAUDE.md` na raiz — valem integralmente aqui.

> Se o repositório-alvo **já tem** parte do módulo, use as seções 5 (fases) e 12
> (armadilhas) como checklist de auditoria em vez de roteiro de criação.

---

## 1. O produto em uma página

O Capital Sena espelha a Mega-Sena oficial:

- O cliente compra **cartelas**. Cada cartela tem **6 números de 1 a 60** + uma **bola extra** (1–60, diferente dos 6).
- Cartelas são vendidas **avulsas** (`valorCartela` da edição) ou em **combos** (pacote com preço fechado).
- Um **admin digita à mão** o resultado real da Mega-Sena. **Não existe integração com API da Caixa.**
- A **apuração** compara cada cartela com o resultado e atribui a faixa: `QUADRA` (4 acertos), `QUINA` (5), `SENA` (6), `SENA_BONUS` (6 + bola extra correta).

Três decisões que definem o desenho e não podem ser invertidas sem reescrever o módulo:

| Decisão | Consequência |
|---|---|
| **O backend nunca gera números.** `SURPRESINHA` é só um rótulo: o frontend sorteia no próprio app e envia os números prontos, igual ao modo `MANUAL`. | Não implemente RNG. `modoSelecao` é metadado. |
| **Cartelas de venda PIX/CARTÃO só nascem quando o pagamento é confirmado.** Antes disso os números ficam guardados em `VendaSena.gatewayPayload.numeros`. | Nada de "reservar" números; não há concorrência entre compradores (dois clientes podem jogar nos mesmos números). |
| **Não existe saldo separado do Sena.** As comissões somam em `Vendedor.saldo` / `Distribuidor.saldo`, os mesmos campos do outro produto. | Relatórios separam por tabela de comissão, não por saldo. |

---

## 2. Pré-requisitos — o que já precisa existir no projeto

Esta spec assume um backend com autenticação e cadastro comercial prontos. Se
faltar algo da lista, implemente antes (ou substitua pelo equivalente do projeto-alvo).

### 2.1 Infraestrutura

| Peça | Contrato mínimo esperado |
|---|---|
| `PrismaService` | Cliente Prisma injetável, com `$transaction(cb)`. |
| `ResponseInterceptor` (global) | Envelopa toda resposta em `{ statusCode, message, data, ...rest }`. Services devolvem `{ message, data }` e o interceptor completa. |
| `HttpExceptionFilter` (global) | Converte exceções Nest no mesmo envelope. |
| `ValidationPipe` global | `{ whitelist: true, transform: true }` — campos não declarados no DTO são removidos. |
| `JwtAuthGuard` + `RolesGuard` + `@Roles(...)` | Perfis: `ADMIN`, `DISTRIBUIDOR`, `VENDEDOR`, `CLIENTE`. |
| `@CurrentUser()` → `RequestUser` | `{ perfil, cpf?, vendedorId?, distribuidorId? }`. |
| `S3UploadService.uploadImageFromBase64(base64, pasta)` | Recebe `data:image/...;base64,...`, devolve URL pública (ou `null`). |
| `PaymentGatewayFactory` | Ver 2.2. |
| `normalizePagination(page, limit)` / `buildPaginatedResponse(data, total, page, limit, { successMessage, emptyMessage })` | Paginação padrão: default 20, teto 100, meta `{ total, page, limit, lastPage }`. |
| `parseBusinessDateTime(valor, campo, timezone)` | Interpreta `"2026-06-07T20:00"` no fuso do negócio (`APP_TIMEZONE`, default `America/Sao_Paulo`) e devolve `{ date }`. |
| `validarMaioridade(data)` / `parseEValidarDataNascimento(str)` | Lança `BadRequestException` para menor de 18. |
| `@IsCpfValido()` | Validator de dígito verificador de CPF. |
| BullMQ + Redis | Opcional — só para o job de ciclo de vida (fase 9). |
| `EmailService` | Opcional — e-mail de compra aprovada. |

### 2.2 Contrato do gateway de pagamento

```ts
interface PaymentGateway {
  criarCobranca(input: {
    vendaId: string; valorCentavos: number;
    quantidadeItens?: number; valorUnitarioCentavos?: number;
    descricao: string;
    cpfPagador: string; nomePagador: string;
    emailPagador?: string; telefonePagador?: string;
    expiracaoSegundos?: number;
    cardToken?: string; installments?: number;   // cartão
  }): Promise<{
    gatewayId: string;
    pixCopiaECola?: string; qrCodeBase64?: string; urlPagamento?: string;
    payload: Record<string, unknown>;
  }>;
  consultarCobranca(gatewayId: string): Promise<{ status: 'PENDENTE'|'APROVADO'|'EXPIRADO'|'CANCELADO'; paidAt?: Date; payload: Record<string, unknown> }>;
  cancelarCobranca(gatewayId: string): Promise<void>;
}
```

A factory precisa de dois métodos:

- `getGateway(tipoPagamento)` — resolve o provedor **para criar** cobrança (PIX pelo env, cartão fixo).
- `getGatewayParaConsulta(tipoPagamento, gatewayPayload)` — resolve **para consultar/cancelar** inspecionando qual chave de provedor existe dentro do `gatewayPayload` salvo. Isso evita quebrar cobranças pendentes quando alguém troca o provedor configurado no meio do caminho.

### 2.3 Modelos e enums que já devem existir

`Usuario` (com `perfil`), `Cliente`, `Vendedor`, `Distribuidor`, e os enums
`Perfil`, `StatusUsuario`, `StatusComissao { PENDENTE, PAGO }`,
`TipoPagamento { PIX, CARTAO, MANUAL }`, `OrigemParticipacao { DIGITAL, FISICO, POS }`.

Campos desses modelos usados pelo Sena:

- `Cliente`: `cpf` **@unique e sempre gravado só com dígitos**, `nome`, `telefone`, `email?`, `dataNascimento?`, `vendedorId?`, `distribuidorId?`.
- `Vendedor`: `distribuidorId` (**NOT NULL** — todo vendedor pertence a um distribuidor), `comissaoPercent`, `saldo`, `usuarioId @unique`, `codigo`.
- `Distribuidor`: `comissaoPercent`, `saldo`, `usuarioId @unique`, `codigo`.

> **Invariante do vínculo do cliente**: o par `(vendedorId preenchido, distribuidorId nulo)` é
> proibido — no repo de referência há CHECK constraint no banco garantindo isso.
> Toda escrita de vínculo feita pelo Sena precisa respeitá-la.

---

## 3. Modelo de dados

Adicione ao `schema.prisma`. Dinheiro é `Decimal`; números da cartela são `Int[]`
(array nativo do Postgres).

```prisma
enum StatusEdicaoSena  { RASCUNHO ATIVA ENCERRADA APURANDO FINALIZADA }
enum StatusVendaSena   { PENDENTE APROVADO RECUSADO CANCELADO }
enum ModoSelecaoSena   { MANUAL SURPRESINHA }
enum FaixaPremiacao    { QUADRA QUINA SENA SENA_BONUS }
enum StatusCartelaSena {
  PENDENTE_PAGAMENTO CONFIRMADA
  NAO_PREMIADA QUADRA QUINA SENA SENA_BONUS
}

model EdicaoSena {
  id                  String           @id @default(uuid())
  numero              String           @unique
  descricao           String?
  dataSorteioMegaSena DateTime
  dataEncerramento    DateTime
  valorCartela        Decimal
  imagemUrl           String?
  status              StatusEdicaoSena @default(RASCUNHO)
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt

  premios   PremioSena[]
  combos    ComboSena[]
  vendas    VendaSena[]
  resultado ResultadoSena?
  cartelas  CartelaSena[]

  @@index([status])
}

model ComboSena {
  id           String   @id @default(uuid())
  edicaoSenaId String
  nome         String
  quantidade   Int      // nº de cartelas do pacote
  preco        Decimal  // preço TOTAL do pacote
  ativo        Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  edicaoSena EdicaoSena @relation(fields: [edicaoSenaId], references: [id], onDelete: Cascade)
  @@index([edicaoSenaId])
}

model PremioSena {
  id           String         @id @default(uuid())
  edicaoSenaId String
  faixa        FaixaPremiacao
  descricao    String
  valor        Decimal
  imagemUrl    String?

  edicaoSena EdicaoSena @relation(fields: [edicaoSenaId], references: [id], onDelete: Cascade)
  @@unique([edicaoSenaId, faixa])
  @@index([edicaoSenaId])
}

model VendaSena {
  id                 String             @id @default(uuid())
  edicaoSenaId       String
  clienteId          String
  vendedorId         String?
  distribuidorId     String?            // escalar — ver nota abaixo
  comboSenaId        String?
  quantidade         Int
  total              Decimal
  status             StatusVendaSena    @default(PENDENTE)
  tipoPagamento      TipoPagamento
  origemParticipacao OrigemParticipacao @default(DIGITAL)
  gatewayId          String?
  gatewayPayload     Json?
  createdAt          DateTime           @default(now())

  edicaoSena               EdicaoSena                @relation(fields: [edicaoSenaId], references: [id])
  cliente                  Cliente                   @relation(fields: [clienteId], references: [id])
  vendedor                 Vendedor?                 @relation(fields: [vendedorId], references: [id])
  cartelas                 CartelaSena[]
  comissaoSena             ComissaoSena?
  comissaoDistribuidorSena ComissaoDistribuidorSena?

  @@index([edicaoSenaId])
  @@index([clienteId])
}

model CartelaSena {
  id                String            @id @default(uuid())
  vendaSenaId       String
  edicaoSenaId      String
  numerosEscolhidos Int[]             // exatamente 6
  setimoNumero      Int?              // a bola extra
  modoSelecao       ModoSelecaoSena
  acertos           Int?              // preenchido na apuração
  setimoAcertou     Boolean?          // preenchido na apuração
  status            StatusCartelaSena @default(PENDENTE_PAGAMENTO)
  createdAt         DateTime          @default(now())

  vendaSena  VendaSena  @relation(fields: [vendaSenaId], references: [id])
  edicaoSena EdicaoSena @relation(fields: [edicaoSenaId], references: [id])

  @@index([edicaoSenaId])
  @@index([vendaSenaId])
  @@index([status])
}

model ResultadoSena {
  id                 String    @id @default(uuid())
  edicaoSenaId       String    @unique
  numerosSorteados   Int[]     // exatamente 6
  setimaBola         Int?      // 7ª bola, base do SENA_BONUS
  imagemResultadoUrl String?
  apurado            Boolean   @default(false)
  apuradoEm          DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  edicaoSena EdicaoSena @relation(fields: [edicaoSenaId], references: [id])
}

model ComissaoSena {
  id          String         @id @default(uuid())
  vendedorId  String
  vendaSenaId String         @unique
  valor       Decimal
  status      StatusComissao @default(PENDENTE)
  createdAt   DateTime       @default(now())

  vendedor  Vendedor  @relation(fields: [vendedorId], references: [id])
  vendaSena VendaSena @relation(fields: [vendaSenaId], references: [id])
}

model ComissaoDistribuidorSena {
  id             String         @id @default(uuid())
  distribuidorId String
  vendaSenaId    String         @unique
  valor          Decimal
  status         StatusComissao @default(PENDENTE)
  createdAt      DateTime       @default(now())

  distribuidor Distribuidor @relation(fields: [distribuidorId], references: [id])
  vendaSena    VendaSena    @relation(fields: [vendaSenaId], references: [id])
}
```

Adicione também aos modelos existentes:

```prisma
// Vendedor e Distribuidor — link/QR próprios do Sena, paralelos aos do outro produto
linkSena   String?
qrcodeSena String?

// Relações inversas
// Vendedor:     vendasSena VendaSena[]   comissoesSena ComissaoSena[]
// Distribuidor: comissoesDistribuidorSena ComissaoDistribuidorSena[]
// Cliente:      vendasSena VendaSena[]
```

> **Nota — `VendaSena.distribuidorId` sem relação.** Na referência esse campo é
> um escalar solto: não há `distribuidor Distribuidor @relation(...)`, então
> nenhum `include` traz o distribuidor e o service precisa buscá-lo à parte e
> anexar na resposta. **Recomendação para uma implementação nova: declare a
> relação** e apague esses helpers. Se optar por manter o escalar (paridade com
> o legado), lembre que `distribuidorId` deixa de ser validado por FK e a
> checagem de existência vira responsabilidade do service.

Migration: `npx prisma migrate dev --name add_capital_sena`.

---

## 4. Estrutura de arquivos

```
src/modules/capital-sena/
  capital-sena.module.ts              # agrega os 5 submódulos
  edicoes-sena/
    dto/create-edicao-sena.dto.ts     # + CreatePremioSenaDto, CreateComboSenaDto
    dto/update-edicao-sena.dto.ts     # PartialType(Create)
    dto/listar-edicoes-sena-loja.dto.ts
    edicoes-sena.controller.ts        # EdicoesSenaController (admin) + EdicoesSenaPublicoController
    edicoes-sena.service.ts
    edicoes-sena-ciclo-vida.service.ts
    edicoes-sena.module.ts
  vendas-sena/
    dto/create-venda-sena.dto.ts      # + ItemNumerosSenaDto
    dto/filtro-vendas-sena.dto.ts
    vendas-sena.controller.ts         # admin
    vendas-sena-loja.controller.ts    # loja pública
    vendas-sena.service.ts            # o coração do módulo
    vendas-sena.module.ts
  sorteio-sena/
    dto/inserir-resultado-sena.dto.ts
    sorteio-sena.controller.ts        # admin + público
    sorteio-sena.service.ts
    sorteio-sena.module.ts
  apuracao-sena/
    apuracao-sena.controller.ts
    apuracao-sena.service.ts
    apuracao-sena.module.ts
  cartelas-sena/
    dto/filtro-cartelas-sena.dto.ts
    cartelas-sena.controller.ts       # cliente + admin
    cartelas-sena.service.ts
    cartelas-sena.module.ts
```

Cada submódulo exporta seu service. `VendasSenaModule` importa
`PagamentosModule` com `forwardRef` (o módulo de pagamentos chama de volta
`VendasSenaService.confirmarPagamento`). `EdicoesSenaModule` e
`SorteioSenaModule` importam `S3UploadModule`. Registre `CapitalSenaModule` no
`AppModule`.

**Nomenclatura dos arquivos `.spec.ts`: um por service** (ver seção 10).

---

## 5. Fases de implementação

Ordem obrigatória — cada fase depende da anterior. Cada uma tem um critério de
pronto verificável.

### Fase 1 — Schema e migration
Modelos da seção 3 + campos novos em `Vendedor`/`Distribuidor`.
**Pronto quando**: `prisma migrate dev` roda limpo e `prisma generate` expõe os tipos.

### Fase 2 — Edições (admin)
`EdicoesSenaService` com `create`, `findAll`, `findOne`, `update`, `ativar`, `encerrar`, `remove`. Regras em 7.1.
**Pronto quando**: dá para criar edição com prêmios+combos, ativar uma só por vez, e o `remove` recusa edição fora de `RASCUNHO`.

### Fase 3 — Vitrine pública
`findAllPublicas`, `findAtiva`, `findOnePublica`. Sem autenticação, só combos `ativo: true`.
**Pronto quando**: `GET /capital-sena/edicao-ativa` devolve a edição com prêmios e combos.

### Fase 4 — Venda MANUAL
`VendasSenaService.create` no caminho `MANUAL`: valida edição/cartelas/cliente/vínculo, cria venda `APROVADO` + cartelas `CONFIRMADA` + comissões, **tudo numa transação**. Regras em 7.3 e 7.6.
**Pronto quando**: um ADMIN registra venda e as cartelas já aparecem confirmadas, com comissão somada ao saldo.

### Fase 5 — Venda PIX/CARTÃO + confirmação
Caminho `PENDENTE`: guarda números no `gatewayPayload`, cria cobrança, devolve dados de pagamento. `confirmarPagamento` cria as cartelas e comissões. Ligue os webhooks. Regras em 7.4.
**Pronto quando**: uma venda PIX nasce sem cartelas, e o webhook (ou o mock) as materializa exatamente uma vez.

### Fase 6 — Área do cliente
`GET /capital-sena/minhas-compras` e `/minhas-cartelas` + detalhe de cartela com checagem de propriedade por CPF.
**Pronto quando**: um CLIENTE só enxerga as próprias cartelas (404 para cartela alheia).

### Fase 7 — Resultado oficial
`SorteioSenaService.inserirResultado` (upsert, `ENCERRADA → APURANDO`), consulta admin e consulta pública. Regras em 7.7.
**Pronto quando**: inserir 6 números válidos numa edição `ENCERRADA` move o status e o endpoint público exibe o resultado.

### Fase 8 — Apuração
`ApuracaoSenaService.apurar`, `resumo`, `listarGanhadores`. Regras em 7.8.
**Pronto quando**: cartelas ganham faixa correta, `resultado.apurado` vira `true` e a edição vira `FINALIZADA`.

### Fase 9 — Ciclo de vida automático (opcional, exige Redis)
Job BullMQ a cada 30s: encerra `ATIVA` vencida e promove a próxima `RASCUNHO`. Regras em 7.2.
**Pronto quando**: com `NODE_ENV=test` ou `EDICOES_SENA_CICLO_VIDA_ENABLED=false` o job nem inicializa; ligado, ele mantém sempre uma edição ativa.

### Fase 10 — Canais extras (opcional)
POS e WhatsApp — seção 9.

---

## 6. Contrato de API

Prefixo global `/api`. Toda rota autenticada usa `@UseGuards(JwtAuthGuard, RolesGuard)` + `@ApiBearerAuth()`.

### 6.1 Edições

| Método | Rota | Perfis | O que faz |
|---|---|---|---|
| POST | `/admin/capital-sena/edicoes` | ADMIN | Cria edição com prêmios e combos |
| GET | `/admin/capital-sena/edicoes` | ADMIN, DISTRIBUIDOR, VENDEDOR | Lista paginada |
| GET | `/admin/capital-sena/edicoes/:id` | ADMIN, DISTRIBUIDOR, VENDEDOR | Detalhe |
| PATCH | `/admin/capital-sena/edicoes/:id` | ADMIN | Atualiza (bloqueado em APURANDO/FINALIZADA) |
| PATCH | `/admin/capital-sena/edicoes/:id/ativar` | ADMIN | RASCUNHO/ENCERRADA → ATIVA |
| PATCH | `/admin/capital-sena/edicoes/:id/encerrar` | ADMIN | ATIVA → ENCERRADA |
| DELETE | `/admin/capital-sena/edicoes/:id` | ADMIN | Exclui (só RASCUNHO) |
| GET | `/capital-sena/edicoes?status=` | público | Lista pública; sem `status`, só ATIVA |
| GET | `/capital-sena/edicao-ativa` | público | Atalho da loja |
| GET | `/capital-sena/edicoes/:id` | público | Detalhe público |

### 6.2 Vendas

| Método | Rota | Perfis | O que faz |
|---|---|---|---|
| POST | `/admin/capital-sena/vendas` | ADMIN, DISTRIBUIDOR, VENDEDOR | Registra venda (ADMIN ⇒ MANUAL aprovada) |
| GET | `/admin/capital-sena/vendas` | ADMIN, DISTRIBUIDOR, VENDEDOR | Lista com filtros |
| GET | `/admin/capital-sena/vendas/cliente/:cpf` | ADMIN, DISTRIBUIDOR, VENDEDOR | Vendas de um CPF |
| GET | `/admin/capital-sena/vendas/:id` | ADMIN, DISTRIBUIDOR, VENDEDOR | Detalhe |
| PATCH | `/admin/capital-sena/vendas/:id/cancelar` | ADMIN | Cancela (body `{ motivo? }`) |
| POST | `/capital-sena/comprar` | público | Compra da loja (só PIX/CARTAO — ver 8.4) |
| GET | `/capital-sena/vendas/:id/status` | público | Polling de pagamento |
| GET | `/capital-sena/minhas-compras` | CLIENTE | Compras do CPF do token |

### 6.3 Cartelas, sorteio e apuração

| Método | Rota | Perfis | O que faz |
|---|---|---|---|
| GET | `/capital-sena/minhas-cartelas?edicaoSenaId=` | CLIENTE (+ADMIN/DIST/VEND) | Cartelas do cliente logado (só vendas APROVADO) |
| GET | `/capital-sena/minhas-cartelas/:id` | CLIENTE (+ADMIN/DIST/VEND) | Detalhe com checagem de CPF |
| GET | `/admin/capital-sena/cartelas?edicaoSenaId=` | ADMIN, DISTRIBUIDOR, VENDEDOR | Cartelas da edição (`edicaoSenaId` obrigatório) |
| GET | `/admin/capital-sena/cartelas/:id` | ADMIN, DISTRIBUIDOR, VENDEDOR | Detalhe sem checagem de posse |
| POST | `/admin/capital-sena/sorteio/:edicaoSenaId/resultado` | ADMIN | Insere resultado (upsert) |
| PUT | `/admin/capital-sena/sorteio/:edicaoSenaId/resultado` | ADMIN | Corrige resultado (mesmo método) |
| GET | `/admin/capital-sena/sorteio/:edicaoSenaId` | ADMIN, DISTRIBUIDOR, VENDEDOR | Resultado + status |
| GET | `/capital-sena/resultado/:edicaoSenaId` | público | Resultado + prêmios |
| POST | `/admin/capital-sena/apuracao/:edicaoSenaId` | ADMIN | Roda a apuração |
| GET | `/admin/capital-sena/apuracao/:edicaoSenaId` | ADMIN, DISTRIBUIDOR, VENDEDOR | Resumo por faixa |
| GET | `/admin/capital-sena/apuracao/:edicaoSenaId/ganhadores` | ADMIN, DISTRIBUIDOR, VENDEDOR | Ganhadores paginados |

### 6.4 DTOs

**`CreateEdicaoSenaDto`**

| Campo | Tipo | Validação |
|---|---|---|
| `numero` | string | obrigatório, não vazio, **único** no banco |
| `descricao` | string? | — |
| `dataSorteioMegaSena` | string ISO | `@IsDateString`, interpretada no fuso do negócio |
| `dataEncerramento` | string ISO | idem, **< dataSorteioMegaSena** |
| `valorCartela` | number | `@Min(0.01)` |
| `imagemBase64` | string? | `data:image/...;base64,...` → upload S3 |
| `premios` | `CreatePremioSenaDto[]` | obrigatório; `@ValidateNested` |
| `combos` | `CreateComboSenaDto[]?` | `@ValidateNested` |

`CreatePremioSenaDto`: `faixa` (enum `FaixaPremiacao`), `descricao` (não vazio), `valor` (`@Min(0)`), `imagemBase64?`.
`CreateComboSenaDto`: `nome` (não vazio), `quantidade` (`@Min(1)`), `preco` (`@Min(0)` — total do pacote).

`premios` e `combos` aceitam **string JSON** além de array (`@Transform` que faz `JSON.parse`, lançando `BadRequestException` em JSON inválido) — legado de envio `multipart`. Mantenha se o frontend-alvo usar form-data; caso contrário, simplifique.

`UpdateEdicaoSenaDto = PartialType(CreateEdicaoSenaDto)`.

**`CreateVendaSenaDto`** — o DTO central:

| Campo | Tipo | Validação |
|---|---|---|
| `edicaoSenaId` | uuid | obrigatório |
| `modoSelecao` | `MANUAL` \| `SURPRESINHA` | obrigatório (só rótulo) |
| `numeros` | `ItemNumerosSenaDto[]` | `@ArrayMinSize(1)`, `@ValidateNested` |
| `quantidade` | int? | 1–1000; default = `numeros.length` |
| `comboSenaId` | uuid? | quando presente, `numeros.length` **tem de bater** com `combo.quantidade` |
| `tipoPagamento` | `PIX`\|`CARTAO`\|`MANUAL` | obrigatório |
| `clienteId` | uuid? | quando presente, dispensa os dados abaixo |
| `cpf` | string? | obrigatório sem `clienteId`; regex + dígito verificador |
| `nome` | string? | obrigatório sem `clienteId`; `@MinLength(2)` |
| `telefone` | string? | obrigatório sem `clienteId` |
| `email` | string? | `@IsEmail`; string vazia → `undefined` |
| `dataNascimento` | string? | `YYYY-MM-DD`; **opcional** (ver 7.3.5) |
| `vendedorId` | uuid? | aceito só de ADMIN e DISTRIBUIDOR (rede própria) |
| `distribuidorId` | uuid? | aceito só de ADMIN |
| `seller_id` | uuid? | id do **Usuario** (ou do vendedor/distribuidor) vindo de `?seller_id=` do link da loja |

`ItemNumerosSenaDto`: `numeros: number[]` (`@ArrayMinSize(6)`, `@ArrayMaxSize(6)`, cada um `@IsInt @Min(1) @Max(60)`) e `bola_extra: number` (`@IsInt @Min(1) @Max(60)`). **Unicidade e a regra "bola extra ≠ os 6" são validadas no service**, não pelo class-validator.

**`InserirResultadoSenaDto`**: `numerosSorteados: number[]` (exatamente 6, 1–60, com `@Transform` que aceita `[1,2,...]`, `"[1,2,...]"` ou `"1,2,3,4,5,6"`), `setimaBola?: number` (1–60), `imagemResultadoUrl?: string`, `imagemBase64?: string`.

**Filtros**: `FiltroVendasSenaDto` (paginação + `edicaoSenaId`, `clienteId`/`clientId`, `vendedorId`, `distribuidorId`, `status`, `cpf`) e `FiltroCartelasSena{Cliente,Admin}Dto` (paginação + `edicaoSenaId`, opcional no cliente e **obrigatório** no admin). Todos com `@Transform` que converte `""`, `"null"` e `"undefined"` em `undefined` — query strings de frontend chegam assim.

---

## 7. Regras de negócio

### 7.1 Edições

Ciclo: `RASCUNHO → ATIVA → ENCERRADA → APURANDO → FINALIZADA`.

**create**
1. Converte as duas datas com `parseBusinessDateTime` (fuso do negócio, não UTC do servidor).
2. `dataEncerramento >= dataSorteioMegaSena` → `BadRequestException`.
3. Faixas de prêmio fora do enum → `BadRequestException`; faixa repetida → `ConflictException`.
4. `numero` já existente → `ConflictException`.
5. Sobe imagens ao S3 (edição em `capital-sena/edicoes/{numero}`, prêmios em `.../premios/{faixa}`) **antes** da transação.
6. Cria edição + prêmios + combos numa `$transaction`. Status inicial `RASCUNHO` (default do schema).

**update**
- Status `APURANDO` ou `FINALIZADA` → `BadRequestException`.
- Revalida a relação entre datas usando os valores novos por cima dos atuais.
- Enviar `premios` **substitui todos** (`deleteMany` + `create`); idem `combos`. Prêmio sem `imagemBase64` novo **preserva a imagem anterior da mesma faixa**.

**ativar**
- Já `ATIVA` → devolve sucesso idempotente (não lança).
- `APURANDO`/`FINALIZADA` → `BadRequestException`.
- **Existe outra edição `ATIVA` → `ConflictException`** ("encerre-a primeiro"). Só uma ativa no sistema inteiro.

**encerrar**: só de `ATIVA`, senão `BadRequestException`.
**remove**: só em `RASCUNHO`, senão `BadRequestException`.

**Transições automáticas** (não são endpoints de edição):
- `ENCERRADA → APURANDO` ao inserir o resultado (7.7).
- `APURANDO → FINALIZADA` ao rodar a apuração (7.8).

**Serialização**: todo `Decimal` sai como **string** (`valorCartela`, `premios[].valor`, `combos[].preco`, `total`). Nunca devolva `Decimal` cru nem converta para `number` (perde precisão).

**Leituras públicas**: sempre `combos: { where: { ativo: true } }`. `findOnePublica` aceita ATIVA/ENCERRADA/APURANDO/FINALIZADA (nunca RASCUNHO). `findAtiva` devolve `NotFoundException` quando não há edição ativa.

### 7.2 Ciclo de vida automático (fase 9)

Fila BullMQ `edicoes-sena-ciclo-vida`, job repetível a cada
`EDICOES_SENA_CICLO_VIDA_INTERVAL_MS` (default 30000), `concurrency: 1`, mais um
job de bootstrap na subida para não esperar o primeiro tick.

Não inicializa se: `NODE_ENV=test`, `EDICOES_SENA_CICLO_VIDA_ENABLED=false`, ou `REDIS_URL` ausente (loga warn e segue).

A cada execução, nesta ordem:
1. **Encerrar expiradas** — `ATIVA` com `dataEncerramento <= agora` → `ENCERRADA`, em lotes de `EDICOES_SENA_CICLO_VIDA_BATCH_SIZE` (default 20), com o `updateMany` filtrando `status: ATIVA` de novo (evita corrida com o admin).
2. **Ativar a próxima** — se **não houver nenhuma ATIVA**, promove a `RASCUNHO` com `dataSorteioMegaSena` futuro mais próximo.

Feche `worker` e `queue` no `onModuleDestroy`.

### 7.3 Compra — `VendasSenaService.create(dto, user?, options?)`

`options`: `{ skipGateway?, origemParticipacao?, requireGateway? }` — usados pelos canais POS/WhatsApp.

A ordem dos passos importa; especialmente **validar o vendedor antes de tocar no cadastro do cliente**, senão um vendedor recusado deixa rastro no vínculo do cliente.

**1. Edição**
- Não existe → `NotFoundException`.
- `status !== ATIVA` → `BadRequestException` citando o status.
- `agora >= dataEncerramento` → `BadRequestException` ("compras encerradas").

**2. `seller_id` (link/QR da loja)**
- Resolve **sempre que vier**, mesmo que não vá ser usado — assim um `seller_id` inexistente falha com `NotFoundException` em vez de sumir em silêncio.
- Resolução: busca `Usuario` por id → se `perfil = VENDEDOR`, acha o `Vendedor` por `usuarioId` e devolve `{ vendedorId, distribuidorId }`; se `DISTRIBUIDOR`, devolve `{ null, distribuidorId }`. Se não for um `Usuario`, tenta o id como `Vendedor.id` e depois como `Distribuidor.id`. Nada bateu → `NotFoundException`.
- **Só aplica quando `!dto.vendedorId && !dto.distribuidorId`**, e substitui **o par inteiro** (nunca campo a campo, senão um link de distribuidor — que resolve `vendedorId` nulo — deixaria passar o `vendedorId` do corpo e misturaria redes).

**3. Combo** — `comboSenaId` tem de pertencer à edição e estar `ativo`, senão `BadRequestException`. Define `quantidadeCombo`.

**4. Cartelas** — normaliza `dto.numeros`; para cada item:
- exatamente 6 números → senão `BadRequestException`;
- sem repetição dentro da cartela → `BadRequestException`;
- todos entre 1 e 60 → `BadRequestException`;
- `bola_extra` inteira, 1–60, **e não pode repetir um dos 6** → `BadRequestException`.
Quantidade esperada = `quantidadeCombo ?? dto.quantidade ?? null`; se definida e diferente de `numeros.length` → `BadRequestException` (com combo, cite o nome do combo).

**5. Vendedor/distribuidor**
- `vendedorId` informado → tem de existir (`NotFoundException`) e, se quem chama é `DISTRIBUIDOR`, **pertencer à sua rede** (`ForbiddenException`).
- `distribuidorId` não informado herda o distribuidor do vendedor.
- `distribuidorId` informado pelo chamador → tem de existir (`NotFoundException`).

**6. Cliente**
- Com `clienteId`: busca (`NotFoundException` se não achar) e atualiza o vínculo comercial se a compra veio por outro vendedor/distribuidor.
- Sem `clienteId`: exige `cpf`, `nome` e `telefone` (`BadRequestException`); **e-mail e data de nascimento são opcionais**. CPF é normalizado para só dígitos. Cliente novo → cria com o vínculo resolvido. Cliente existente → se não tem `dataNascimento` salva e uma veio agora, preenche a lacuna; atualiza o vínculo se mudou.
- **Maioridade só é validada quando há data cadastrada.** O checkout do Sena não coleta essa data; exigi-la travaria todo cliente vindo desse fluxo.

**7. Tipo de pagamento** — se `user.perfil === 'ADMIN'`, a venda é **forçada para `MANUAL`** (aprovada na hora, sem gateway), qualquer que seja o valor enviado. **Ver 8.4: na loja pública, `MANUAL` precisa ser recusado.**

**8. Total** — `combo.preco` quando há combo; senão `valorCartela × numeros.length`. Grava com `new Prisma.Decimal(total.toFixed(2))`.

**9a. Caminho `MANUAL`** — uma `$transaction` que:
1. cria `VendaSena` com `status: APROVADO`;
2. cria as `CartelaSena` com `status: CONFIRMADA` (`numerosEscolhidos`, `setimoNumero = bola_extra`, `modoSelecao`);
3. gera comissões (7.6).

**9b. Caminho `PIX`/`CARTAO`**
1. Cria `VendaSena` `PENDENTE` com `gatewayPayload = { modoSelecao, numeros: [{ numeros, bola_extra }] }`. **Nenhuma `CartelaSena` é criada agora.**
2. Salvo `options.skipGateway` (POS), chama `getGateway(tipoPagamento).criarCobranca({ vendaId, valorCentavos: round(total*100), quantidadeItens: combo ? 1 : n, valorUnitarioCentavos, descricao: "Capital Sena — Edição {numero} — {n} cartela(s)", cpfPagador, nomePagador, emailPagador?, telefonePagador, expiracaoSegundos: 3600 })`.
3. Salva `gatewayId` e faz merge do payload do gateway **preservando `modoSelecao` e `numeros`** (perder isso inviabiliza a confirmação).
4. Erro no gateway: com `options.requireGateway`, marca a venda `RECUSADO` (guardando `erroPagamento`) e lança `BadGatewayException`; sem a flag, loga o erro e devolve a venda sem dados de pagamento.
5. Resposta: a venda serializada + `pagamento: { pixCopiaECola?, qrCodeBase64?, urlPagamento? }`.

### 7.4 Confirmação de pagamento — `confirmarPagamento(vendaSenaId, gatewayPayload?)`

Chamado pelos webhooks dos gateways (e pelo polling do POS).

1. Venda inexistente → `NotFoundException`.
2. `status !== PENDENTE` → `ConflictException`. **É isso que dá idempotência**: webhook duplicado não duplica cartelas nem comissão. Quem chama deve tratar esse conflito como "já processado", não como falha.
3. Lê `gatewayPayload.numeros` e `gatewayPayload.modoSelecao` e **revalida** com as mesmas regras do passo 4 de 7.3.
4. Numa `$transaction`: venda → `APROVADO` (payload com merge + `confirmadoEm`), cria as `CartelaSena` `CONFIRMADA`, gera comissões.
5. Fora da transação, dispara (fire-and-forget) o e-mail de compra aprovada — que é no-op se o cliente não tiver e-mail.

### 7.5 Cancelamento — `cancelar(id, motivo?)`

`ADMIN` apenas. Venda já `CANCELADO` → `ConflictException`. Numa `$transaction`:
1. apaga as `CartelaSena` da venda;
2. **reverte as comissões**: para o vendedor, decrementa `Vendedor.saldo` e apaga a `ComissaoSena`; **faça o mesmo para `ComissaoDistribuidorSena` e `Distribuidor.saldo`** (a referência esquece essa metade — ver 12.1);
3. tenta `getGatewayParaConsulta(...).cancelarCobranca(gatewayId)` — melhor esforço, só loga warn se falhar;
4. marca `CANCELADO`, gravando `motivoCancelamento` e `canceladoEm` no `gatewayPayload`.

### 7.6 Comissões — `gerarComissaoSena(tx, venda, vendedorId, distribuidorId, total)`

Sempre **dentro da mesma transação** que aprova a venda (tanto no `MANUAL` quanto na confirmação).

- **Vendedor**: se `Vendedor.comissaoPercent > 0`, cria `ComissaoSena` com `valor = total × percent / 100` (arredondado a 2 casas) e faz `saldo: { increment: valor }`.
- **Distribuidor**: mesma lógica, independente, com `distribuidorId` (o da venda ou o herdado do vendedor), gravando `ComissaoDistribuidorSena` e somando ao `Distribuidor.saldo`.

As duas podem disparar na mesma venda. Os percentuais são **por registro** (`comissaoPercent` do vendedor/distribuidor) — a tabela `ConfiguracaoComissao` existe mas **não é lida** neste fluxo.

### 7.7 Resultado oficial — `inserirResultado(edicaoSenaId, dto)`

- Edição inexistente → `NotFoundException`; status fora de `ENCERRADA`/`APURANDO` → `BadRequestException`.
- 6 números exatos (`BadRequestException`), sem repetição (`ConflictException`), todos 1–60 (`BadRequestException`).
- `setimaBola`, se enviada, **não pode repetir** um dos 6 → `ConflictException`.
- Imagem: usa `imagemResultadoUrl` se veio pronta; se veio `imagemBase64`, sobe para `capital-sena/resultados/{edicaoSenaId}`. Falha de upload que **não** seja `BadRequestException` é engolida com warn (não derruba o cadastro do resultado).
- **Upsert por `edicaoSenaId`** — `POST` e `PUT` chamam o mesmo método. No update, a imagem só é sobrescrita se uma nova veio, e **`apurado` volta para `false` / `apuradoEm` para `null`** (corrigir o resultado destrava rodar a apuração de novo).
- Se a edição estava `ENCERRADA`, vira `APURANDO`.

Consulta admin devolve `{ edicaoSenaId, edicaoNumero, status, resultado }`; a pública devolve edição + resultado + prêmios (com `valor` string).

### 7.8 Apuração — `apurar(edicaoSenaId)`

Pré-condições (nesta ordem): edição existe (`NotFoundException`); `status === APURANDO` (`BadRequestException`); existe `resultado` (`BadRequestException`); `resultado.apurado === false` (`ConflictException`).

Só entram cartelas com `status = CONFIRMADA` da edição.

```
sorteados = Set(resultado.numerosSorteados)
acertos   = cartela.numerosEscolhidos.filter(n => sorteados.has(n)).length

se acertos === 6:
    se resultado.setimaBola != null:
        setimoAcertou = (cartela.setimoNumero === resultado.setimaBola)
    senão:
        setimoAcertou = false   // referência usa um fallback que nunca acerta — ver 12.1.6
    status = setimoAcertou ? SENA_BONUS : SENA
senão se acertos === 5: status = QUINA
senão se acertos === 4: status = QUADRA
senão:                  status = NAO_PREMIADA
```

Grava `acertos`, `setimoAcertou` e `status` em cada cartela. Ao final, numa
`$transaction`: `resultado.apurado = true` + `apuradoEm = agora`, e a edição vira
`FINALIZADA`. Retorno: resumo com `totalCartelas`, `naoPremidas`, `quadras`,
`quinas`, `senas`, `senaBonus`, `numerosSorteados`.

> **Escreva a atualização das cartelas em lote e dentro da transação** — um
> `updateMany` por faixa, ou `$transaction` com os updates acumulados. A
> referência faz um `update` por cartela fora de transação (12.2).

`resumo(edicaoSenaId)`: exige `resultado.apurado` (`BadRequestException`) e conta por faixa (aqui o total considera **todas** as cartelas da edição, não só as confirmadas).

`listarGanhadores(edicaoSenaId, page, limit)`: cartelas com faixa `QUADRA`+, ordenadas por `status desc, acertos desc`, incluindo `cliente { nome, cpf, telefone }` e `vendedor { nome, codigo }` via `vendaSena`.

### 7.9 Cartelas

- **Cliente** (`listarCartelasCliente(cpf, page, limit, edicaoSenaId?)`): normaliza o CPF para dígitos, resolve o `Cliente`; se não existir devolve lista vazia (**não** 404). Filtra por `vendaSena: { clienteId, status: 'APROVADO' }` — cartela de venda pendente/cancelada nunca aparece. Inclui a edição com `resultado { numerosSorteados, apurado }` para o app marcar acertos.
- **Detalhe** (`detalharCartela(id, cpf?)`): quando `cpf` é passado (área do cliente) e não bate com o do dono, responde **`NotFoundException`** — nunca `Forbidden` (não revela a existência da cartela).
- **Admin** (`listarPorEdicao`): todas as cartelas da edição, sem filtro de status, com dados de comprador e vendedor.

---

## 8. Segurança do vínculo comercial

A parte mais fácil de errar: `vendedorId`/`distribuidorId` decidem **para quem
vai a comissão**. Regra geral — *quem está autenticado não escolhe o vínculo; o
token escolhe*.

### 8.1 Matriz

| Origem | `vendedorId` | `distribuidorId` | `seller_id` |
|---|---|---|---|
| **ADMIN** | livre | livre | ignorado na prática |
| **VENDEDOR** | **forçado** ao do token | descartado (herda do vendedor) | descartado |
| **DISTRIBUIDOR** | aceito **só** se o vendedor for da sua rede (senão 403) | **forçado** ao do token | descartado |
| **Loja pública** (sem token) | **descartado** | **descartado** | **única** fonte do vínculo |
| **POS / WhatsApp** | omitido do DTO | omitido do DTO | omitido do DTO |

### 8.2 Onde aplicar

No **controller autenticado**, antes de chamar o service, aplique um helper que
sobrescreve o DTO com o vínculo do token (`VENDEDOR` sem `vendedorId` no token →
`ForbiddenException`; `DISTRIBUIDOR` sem `distribuidorId` → `ForbiddenException`).
No **controller da loja pública**, apague `vendedorId` e `distribuidorId` do DTO
antes de chamar o service.

Esses dois `delete` não são decorativos: o service só deixa `seller_id` definir o
vínculo quando **nenhum** dos dois campos veio. Um corpo com `vendedorId` torna
essa condição falsa, o bloco do `seller_id` é pulado inteiro e o valor do corpo
chega intacto na geração de comissão — qualquer pessoa, sem login, escolhendo o
destino do dinheiro.

### 8.3 Regra do par inteiro

Ao aplicar o `seller_id`, substitua **o par completo** (`vendedorId` **e**
`distribuidorId`), nunca campo a campo com `??`. Link de distribuidor resolve
`vendedorId = null` por definição; mesclar campo a campo mistura redes.

### 8.4 `tipoPagamento` na loja pública — **corrija isto**

`POST /capital-sena/comprar` é anônimo e o service só força `MANUAL` para
`ADMIN`. Como o DTO aceita o enum inteiro, um corpo com
`"tipoPagamento": "MANUAL"` cria uma venda **`APROVADO` com cartelas
`CONFIRMADA` sem nenhum pagamento**. Na implementação nova, restrinja na rota
pública (e no DTO dela) a `PIX` e `CARTAO`, recusando `MANUAL` com
`BadRequestException`. O mesmo vale para qualquer canal sem autenticação.

---

## 9. Canais extras (fase 10, opcional)

Nenhum dos dois duplica regra de negócio: ambos montam um `CreateVendaSenaDto` e
chamam `VendasSenaService.create`.

### 9.1 POS (maquininha)

DTO = `CreateVendaSenaDto` **menos** `vendedorId`, `distribuidorId`, `seller_id` e
`tipoPagamento` (que volta como opcional restrito a `PIX`).

- `GET /pos/capital-sena/edicoes` — edições ativas com combos.
- `POST /pos/capital-sena/vendas` — força `tipoPagamento: PIX`, aplica o vínculo do token do POS e chama `create(dto, user, { origemParticipacao: POS, requireGateway: true })`. A venda nasce `PENDENTE` com cobrança criada.
- `GET /pos/capital-sena/vendas/:id/pagamento` — **polling**: se a venda está `PENDENTE` e tem `gatewayId`, consulta a cobrança; se o gateway diz `APROVADO`, chama `confirmarPagamento` (tratando `ConflictException` como "já confirmada") e devolve o status com label legível.

### 9.2 WhatsApp

DTO = `CreateVendaSenaDto` **menos** os dados de cliente (resolvidos pelo JWT do
canal) e os campos de origem/pagamento.

- `GET /whatsapp/sena/campanhas/ativa` — edição ativa formatada para o bot.
- `POST /whatsapp/sena/pedidos` — cria pedido + cobrança PIX numa chamada (`create(dto, undefined, { origemParticipacao: DIGITAL, requireGateway: true })`).
- `GET /whatsapp/sena/pedidos/:id/pagamento`, `/cartelas`, `/`, `/:id` — consultas do bot.

### 9.3 Webhooks de pagamento

Os handlers de webhook são **compartilhados** com o outro produto: cada um
procura a cobrança primeiro na tabela de vendas do Capital Prêmios e **só cai
para `VendaSena`** se não achar. Ao achar:

1. se `status !== PENDENTE`, loga e retorna (webhook duplicado);
2. `vendasSenaService.confirmarPagamento(venda.id, payloadDoWebhook)`;
3. dispara o e-mail de compra aprovada sem `await`.

---

## 10. Testes obrigatórios

`.spec.ts` por service, Prisma mockado (`jest-mock-extended`), **cobertura mínima
de 70%**. Casos que precisam existir:

**`vendas-sena.service.spec.ts`** (o mais crítico)
- edição inexistente / não ATIVA / já encerrada → erro correspondente;
- cartela com número repetido, fora de 1–60, com menos/mais de 6 números → `BadRequestException`;
- `bola_extra` igual a um dos 6 → `BadRequestException`;
- combo com quantidade divergente de `numeros.length` → `BadRequestException` citando o combo;
- ADMIN enviando `PIX` → venda sai `MANUAL`/`APROVADO` e **não** chama o gateway;
- MANUAL cria venda + cartelas `CONFIRMADA` + comissões na mesma transação;
- PIX cria venda `PENDENTE` **sem** cartelas, com `gatewayPayload.numeros` preservado após o merge do retorno do gateway;
- falha do gateway com `requireGateway` → venda `RECUSADO` + `BadGatewayException`; sem a flag → venda devolvida sem dados de pagamento;
- `seller_id` de vendedor e de distribuidor resolvem o par correto; `seller_id` inexistente → `NotFoundException`;
- corpo com `vendedorId` numa compra pública **não** define a comissão;
- DISTRIBUIDOR tentando vender por vendedor de outra rede → `ForbiddenException`;
- `confirmarPagamento` cria cartelas e comissões uma única vez; segunda chamada → `ConflictException`;
- `cancelar` apaga cartelas e **reverte as duas comissões** (vendedor **e** distribuidor);
- cliente novo sem `dataNascimento` compra normalmente; cliente com data de menor de 18 → erro.

**`edicoes-sena.service.spec.ts`**: `dataEncerramento >= dataSorteio` → erro; faixa duplicada → `ConflictException`; `numero` duplicado → `ConflictException`; ativar com outra ativa → `ConflictException`; ativar já ativa → idempotente; editar `APURANDO`/`FINALIZADA` → erro; remover fora de `RASCUNHO` → erro; update de prêmios preserva imagem anterior por faixa.

**`sorteio-sena.service.spec.ts`**: status inválido → erro; números repetidos → `ConflictException`; `setimaBola` repetindo um dos 6 → `ConflictException`; upsert reseta `apurado`; `ENCERRADA → APURANDO`.

**`apuracao-sena.service.spec.ts`**: matriz de acertos (0..6) → faixa; `SENA_BONUS` com e sem `setimaBola` cadastrada; edição fora de `APURANDO` → erro; já apurada → `ConflictException`; só cartelas `CONFIRMADA` entram; ao final, `FINALIZADA` + `apurado: true`.

**`cartelas-sena.service.spec.ts`**: cliente inexistente → lista vazia; só vendas `APROVADO`; detalhe com CPF de outro cliente → `NotFoundException`.

---

## 11. Variáveis de ambiente

Sempre via `ConfigService` — **nunca** `process.env` direto.

| Variável | Default | Uso |
|---|---|---|
| `APP_TIMEZONE` | `America/Sao_Paulo` | Interpretação das datas da edição |
| `PIX_GATEWAY_PROVIDER` | `FSPAY` | Provedor PIX (`FSPAY`/`AGILIZEPAY`/`PAGBANK`/`MERCADOPAGO`) |
| `MOCK_PIX_AUTO_APPROVE` | `false` | `true` força o gateway PIX mock (dev) |
| `REDIS_URL` | — | Sem ela, o job de ciclo de vida não sobe |
| `EDICOES_SENA_CICLO_VIDA_ENABLED` | `true` | `false` desliga o job |
| `EDICOES_SENA_CICLO_VIDA_INTERVAL_MS` | `30000` | Intervalo do job |
| `EDICOES_SENA_CICLO_VIDA_BATCH_SIZE` | `20` | Lote de encerramento |
| `NODE_ENV` | — | `test` pula o job |

Somam-se as credenciais de S3 e dos gateways, já existentes no projeto.

---

## 12. Armadilhas e decisões deliberadas

### 12.1 Bugs da implementação de referência — **não replique**

1. **Cancelamento não reverte a comissão do distribuidor.** `cancelar` desconta só `Vendedor.saldo` e apaga `ComissaoSena`; `ComissaoDistribuidorSena` e o saldo do distribuidor ficam intactos, inflando a carteira dele. Reverta as duas.
2. **Apuração faz N+1 fora de transação.** Um `update` por cartela, sequencial, antes da transação final: numa edição grande é lento e, se cair no meio, deixa metade das cartelas apurada com `resultado.apurado` ainda `false`. Use `updateMany` por faixa dentro de uma transação.
3. **Loja pública aceita `tipoPagamento: MANUAL`** → cartelas grátis. Ver 8.4.
4. **Corrigir o resultado depois de apurar não desfaz a apuração anterior.** O upsert reseta `apurado`, mas as cartelas mantêm status/acertos antigos e a edição continua `FINALIZADA`. Ao reapurar, comece resetando as cartelas da edição para `CONFIRMADA` (`acertos: null`, `setimoAcertou: null`) e devolva a edição para `APURANDO`.
5. **`resumo` e `apurar` contam bases diferentes.** `apurar` devolve `totalCartelas` = cartelas `CONFIRMADA` processadas; `resumo` conta **todas** as cartelas da edição. Escolha uma base e use nas duas.
6. **Sem `setimaBola`, `SENA_BONUS` é inalcançável.** O fallback `sorteados.has(cartela.setimoNumero)` só é avaliado quando `acertos === 6` — e nesse ponto o conjunto sorteado é exatamente igual aos 6 números da cartela, dos quais a bola extra é obrigatoriamente diferente. O ramo é **sempre falso**: código morto disfarçado de regra. Decida explicitamente — ou exija `setimaBola` para apurar (`BadRequestException` sem ela), ou trate 6 acertos sempre como `SENA` quando ela faltar.

### 12.2 Decisões que parecem bug e não são

- **`modoSelecao` sem gerador.** O backend nunca sorteia; `SURPRESINHA` é rótulo de UX. Não "conserte" adicionando RNG — o frontend depende de enviar os números.
- **Maioridade não bloqueia sem data cadastrada.** O checkout do Sena não coleta `dataNascimento`; exigir a validação travaria todo cliente vindo desse fluxo.
- **E-mail não é obrigatório.** O gateway usa um endereço padrão quando falta; o e-mail de compra aprovada simplesmente não é enviado.
- **Cartelas só nascem após o pagamento.** É o que permite guardar os números no `gatewayPayload` e não sujar o banco com cartelas de compras abandonadas. Quem consultar cartelas de uma venda `PENDENTE` **deve** receber lista vazia.
- **`seller_id` é resolvido mesmo quando não usado.** Falhar com 404 num link quebrado é melhor do que creditar a comissão a ninguém em silêncio.

### 12.3 Detalhes que costumam passar batido

- **Todo `Decimal` sai como string** na resposta. `Number(decimal)` só dentro de cálculo.
- **CPF sempre normalizado** (`cpf.replace(/\D/g, '')`) na escrita e na busca. Gravar formatado quebra o `@unique` e a área do cliente.
- **`quantidade` do DTO é redundante** com `numeros.length` — serve de confirmação. Com combo, quem manda é `combo.quantidade`.
- **`findByCliente` lança `NotFoundException`** quando o CPF não tem cadastro, enquanto a listagem de cartelas devolve lista vazia. Padronize (recomendado: lista vazia nos dois).
- **Filtros de query precisam do `@Transform`** que colapsa `""`/`"null"`/`"undefined"` em `undefined`; sem ele, `@IsUUID` rejeita query strings normais de frontend.
- **`forwardRef` entre vendas e pagamentos** é obrigatório: o módulo de pagamentos injeta o service de vendas e vice-versa.
- **Datas da edição** vêm sem timezone (`"2026-06-07T20:00"`) e precisam ser interpretadas no fuso do negócio, não no do servidor.

---

## 13. Convenções obrigatórias (resumo do `CLAUDE.md`)

- `camelCase` (variáveis/funções), `PascalCase` (classes/enums), `kebab-case` (arquivos), `UPPER_SNAKE_CASE` (constantes).
- **Todo** input passa por DTO com `class-validator`; **todo** campo de DTO tem `@ApiProperty`/`@ApiPropertyOptional` com `example` e `description`.
- Swagger obrigatório: `@ApiTags` no controller, `@ApiOperation({ summary })` **com o perfil autorizado no texto** (ex.: `(ADMIN apenas)`), `@ApiQuery` nos filtros, `@ApiBearerAuth()` nas rotas protegidas. **Mudou `@Roles(...)` ⇒ atualize o `summary` do mesmo endpoint.**
- **Nunca `any`.** Tipar tudo, inclusive os payloads JSON (`Record<string, unknown>` + narrowing).
- `private readonly logger = new Logger(NomeDaClasse.name)` em todo service.
- `ConfigService` para env; nunca `process.env`.
- IDs sempre UUID (`@id @default(uuid())`, `@IsUUID('4')`, `ParseUUIDPipe` nos params).
- Transação Prisma obrigatória em qualquer operação que toque múltiplas tabelas.
- Exceções do Nest (`NotFoundException`, `BadRequestException`, `ConflictException`, `ForbiddenException`, `BadGatewayException`); nunca montar erro na mão no controller.
- Services devolvem `{ message, data }`; o interceptor global monta `{ statusCode, message, data }`.
- Commits em português: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.

---

## 14. Definition of Done

- [ ] Migration aplicada; `prisma generate` sem erro.
- [ ] Os 5 submódulos registrados e o `CapitalSenaModule` no `AppModule`.
- [ ] Todas as rotas da seção 6 respondendo, com `@Roles` e Swagger conferindo com a tabela.
- [ ] Fluxo ponta a ponta MANUAL: venda aprovada + cartelas confirmadas + comissões creditadas.
- [ ] Fluxo ponta a ponta PIX: venda pendente sem cartelas → confirmação → cartelas + comissões, **uma vez só** mesmo com webhook repetido.
- [ ] Loja pública recusa `MANUAL` e ignora `vendedorId`/`distribuidorId` do corpo (8.4).
- [ ] Cancelamento reverte cartelas **e as duas comissões**.
- [ ] Resultado + apuração levam a edição a `FINALIZADA` com faixas corretas (matriz 0..6 acertos testada).
- [ ] Área do cliente só devolve cartelas próprias e de vendas aprovadas.
- [ ] `npm run test` verde e `npm run test:cov` ≥ 70% nos services do módulo.
- [ ] `npm run build` e `npm run lint` limpos.
