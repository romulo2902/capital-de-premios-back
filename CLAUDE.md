# CLAUDE.md — Capital de Prêmios API

Este arquivo define as regras e convenções que DEVEM ser seguidas em TODO o projeto.

---

## Nomenclatura

- `camelCase` para variáveis e funções
- `PascalCase` para classes, interfaces e enums
- `kebab-case` para nomes de arquivos e pastas
- `UPPER_SNAKE_CASE` para constantes

---

## Padrões NestJS Obrigatórios

- **Sempre** usar DTOs com `class-validator` para toda entrada de dados
- **Sempre** usar `@ApiProperty()` / `@ApiPropertyOptional()` do Swagger em **todos** os campos de DTO, com `example` e `description`
- **Sempre** que alterar uma rota, DTO, `@Roles` ou regra de acesso, **atualizar** o Swagger correspondente:
  - `@ApiTags('...')` no controller
  - `@ApiOperation({ summary: '...' })` em cada endpoint — **incluir o perfil autorizado no summary**, ex: `(ADMIN)`, `(ADMIN + DISTRIBUIDOR)`, `(ADMIN apenas)`
  - `@ApiQuery(...)` em parâmetros de query
  - `@ApiBearerAuth()` em rotas protegidas
  - **Regra de ouro**: se mudou `@Roles(...)` → obrigatório atualizar `@ApiOperation({ summary })` do mesmo endpoint
- **Nunca** usar `any` — tipar explicitamente tudo
- **Sempre** injetar `ConfigService` para ler variáveis de ambiente — **nunca** usar `process.env` diretamente
- **Sempre** usar `Logger` do NestJS em todo service:
  ```typescript
  private readonly logger = new Logger(NomeDaClasse.name);
  ```
- **Transações Prisma** obrigatórias em operações que afetam múltiplas tabelas
- **Sempre** usar guards para autenticação: `@UseGuards(JwtAuthGuard, RolesGuard)`
- **IDs sempre UUID** — todo campo `id` no schema Prisma deve usar `@id @default(uuid())`, nunca auto-incremento. DTOs que recebem IDs devem validar com `@IsUUID()`
- **Sempre** usar `@Roles()` decorator para controle de acesso por perfil

---

## Padrão de Resposta da API

```typescript
{
  statusCode: number;
  message: string;
  data: T | T[] | null;
}
```

Implementado via `ResponseInterceptor` global.

---

## Tratamento de Erros

- **Sempre** lançar exceções do NestJS (`NotFoundException`, `BadRequestException`, etc.)
- **Nunca** retornar erro diretamente no controller
- Filtro global `HttpExceptionFilter` trata todos os erros

---

## Sorteio em Tempo Real — Firebase

**Decisão arquitetural**: o sorteio em tempo real usa **Firebase Firestore**, não WebSocket.

- O backend (`SorteioService`) escreve cada número sorteado no Firestore via **Firebase Admin SDK**
- O frontend escuta as mudanças em tempo real via **Firebase Client SDK** (sem polling)
- Cada cliente marca os números na própria cartela localmente ao receber os eventos

```typescript
// SorteioService — escreve no Firestore a cada número sorteado
await firestore.collection('sorteios').doc(edicaoId)
  .collection('numeros')
  .add({ numero, sequencia, timestamp: FieldValue.serverTimestamp() });
```

Estrutura no Firestore:
```
sorteios/{edicaoId}/status      → { estado: 'em_andamento' | 'encerrado' }
sorteios/{edicaoId}/numeros/{}  → { numero, sequencia, timestamp }
```

---

## Contextos de Acesso

### Painel Admin (`/admin` | `POST /auth/login`)
Autenticação via **email + senha**.

| Perfil | Permissões |
|--------|------------|
| `ADMIN` | Acesso total: usuários, edições, sorteios, relatórios, saques, configurações |
| `DISTRIBUIDOR` | Gerenciar próprios vendedores, visualizar vendas, solicitar saques |

### Web / Loja (`/loja` | `POST /auth/loja`)
Autenticação via **CPF** (sem senha).

| Perfil | Permissões |
|--------|------------|
| `VENDEDOR` | Acessar próprio dashboard, ver comissões, solicitar saques |
| `CLIENTE` | Comprar bilhetes, consultar resultados, ver próprias compras |

### Hierarquia de Cadastro

```
ADMIN → cadastra → DISTRIBUIDOR
DISTRIBUIDOR → cadastra → VENDEDOR
CLIENTE → auto-cadastro por CPF (independente)
```

O `DISTRIBUIDOR` cadastra, edita e inativa vendedores em duas superfícies:
`POST/PATCH/DELETE /admin/vendedores` (painel) e `POST /pos/vendedores`
(terminal). Em ambas o `distribuidorId` **vem do token** — o campo do corpo é
descartado, e vendedor de outra rede responde 404 (nunca 403: responder
diferente entregaria a existência do cadastro alheio a quem chutar UUID).

- Todo `Vendedor` pertence obrigatoriamente a um `Distribuidor` (FK `distribuidorId`)
- `Cliente` acessa a loja ou compra com um Vendedor. Ao ser cadastrado no checkout ou via Admin (`POST /admin/vendas`), o backend **garante** pelo Token JWT (`@CurrentUser`) o vínculo da comissão ao `vendedorId` ou `distribuidorId` logado. Nunca confiar no frontend para ID de vendedor.
- **Cliente é criado automaticamente quando o pagamento é aprovado** (webhook do gateway). O checkout coleta: CPF, Nome, E-mail, Celular. O `VendasService` faz `upsert` do cliente.

```typescript
// VendasService — executado no webhook de pagamento aprovado
const cliente = await prisma.cliente.upsert({
  where: { cpf: dto.cpf },
  update: { nome: dto.nome, email: dto.email, telefone: dto.telefone },
  create: { cpf: dto.cpf, nome: dto.nome, email: dto.email, telefone: dto.telefone },
});
```

### Inativação de Vendedor e Distribuidor

Inativar é **lógico**, nunca `DELETE` físico: o registro fica e o histórico de
vendas e comissões continua intacto.

O status precisa cair em **duas tabelas na mesma transação** — `Vendedor`/
`Distribuidor` **e** `Usuario`. O login do painel (`POST /auth/login`) e o
`JwtStrategy` validam `Usuario.status`; mexer só na tabela de perfil deixa o
inativado autenticando normalmente. O canal POS não tinha esse furo porque
valida o status do próprio vendedor.

Reativar segue o mesmo caminho, pelo `PATCH` com `status: ATIVO`.

---

## Maquininhas de Cartão

Cada `Maquininha` pertence a **um** distribuidor e opera com **no máximo um**
vendedor. `vendedorId` nulo significa "no estoque do distribuidor" — estado
válido, inclusive porque o próprio distribuidor lança venda.

`numeroSerie` é único global e normalizado (sem espaços, caixa alta): um
aparelho físico existe uma vez só, então uma rede não cadastra a maquininha que
já está em outra.

Duas superfícies, com o recorte sempre vindo do token:

| Perfil | Enxerga | Cadastra/edita |
|--------|---------|----------------|
| `ADMIN` | todas, filtra por rede | sim, escolhendo a rede (`distribuidorId` obrigatório) |
| `DISTRIBUIDOR` | só a própria rede | sim, sempre na própria rede |
| `VENDEDOR` | só o aparelho dele (POS) | não |

### Exclusão de Maquininha

`DELETE /admin/maquininhas/:id` é **ADMIN apenas** e a exclusão é **lógica**
(`deletedAt`). É estado distinto de `status: INATIVA`: inativa é aparelho fora
de operação que segue na frota e o DISTRIBUIDOR reativa; excluída sai da frota e
some de toda listagem, inclusive do seletor do POS.

Nunca há `DELETE` físico: `MovimentoCreditoMaquininha` referencia a maquininha
com `ON DELETE RESTRICT`, e o razão é a fonte da verdade do saldo — apagar a
linha levaria o histórico de crédito junto.

O filtro `deletedAt: null` mora **só** em `buildEscopoDoOperador`, por onde toda
leitura passa. Consulta nova que não use o escopo é a forma mais fácil de uma
excluída reaparecer.

Duas travas:

- **Aparelho com saldo não é excluído** (409). Sumir da listagem levando o
  crédito junto prenderia o dinheiro sem tela para recuperá-lo; retirar antes é
  um `AJUSTE_DEBITO`, que fica no extrato.
- **`numeroSerie` segue único global, incluindo excluídas.** Um aparelho físico
  existe uma vez só, e liberar a série daria dois históricos de crédito ao mesmo
  aparelho. Recadastrar responde 409 com mensagem própria.

---

`Venda.maquininhaId` e `VendaSena.maquininhaId` são **exclusivos do canal POS**.
A garantia é estrutural, não convenção: o campo trafega por `CreateVendaOptions`
e não existe nos DTOs de venda do admin e da loja, então nesses canais a coluna
fica nula por construção.

### Crédito da Maquininha

O aparelho carrega um limite em reais concedido pelo ADMIN. Venda **MANUAL**
com `maquininhaId` debita o `total` do `saldoCredito`; cancelar a venda
devolve. Não cobre venda PIX — ali o gateway já liquida.

No POS, `maquininhaId` é **obrigatório** na venda MANUAL (400 sem ele). O
débito é condicional ao campo, então omiti-lo contornava o controle inteiro:
a venda nascia APROVADA, com cartela alocada, sem consumir limite — e as
travas de rede, aparelho inativo, excluído e limite não configurado nem
chegavam a rodar, porque todas dependem de um id informado. A exigência mora
em `PosService.resolverMaquininha`, e não no serviço de venda, porque o canal
do ADMIN também lança MANUAL e ali a ausência de aparelho é legítima — o
admin não consome crédito de maquininha nenhuma.

Aparelho novo nasce **operante**: `MaquininhasService.create` grava o teto no
máximo, **R$ 5.000** (`LIMITE_CREDITO_MAXIMO`), e credita **R$ 2.000** de saldo
(`CREDITO_INICIAL_MAQUININHA`). O saldo é menor que o teto de propósito — o
aparelho já sai vendendo e ainda sobra espaço de recarga; nascer com saldo igual
ao teto travaria qualquer recarga até o vendedor gastar. O máximo existe para
que um zero a mais na digitação não ponha milhares a mais na mão de um
vendedor.

O crédito de abertura entra como `RECARGA` no razão, **no mesmo commit do
cadastro** — não como `DEFAULT` de coluna. `saldoCredito` é a materialização do
razão: saldo que nasce sem movimento por trás quebraria a identidade
`saldo = Σ movimentos` já no cadastro, e o extrato abriria com um valor que
ninguém explica. Dar só o teto sem o saldo também não serve: o aparelho teria
limite e nada para gastar, e a primeira venda MANUAL morreria em "crédito
insuficiente".

`limiteCredito = 0` significa **não configurado**, e aparelho não configurado
**não vende no MANUAL** — a venda é recusada com 409. Vender sem teto seria
adiantar dinheiro da casa sem limite nenhum, que é o que o controle existe para
impedir. Com o default de 2.000, esse estado só é alcançado por decisão
explícita de quem zera o limite. Para travar um aparelho que já opera, use
`status: INATIVA`.

Toda alteração de saldo nasce de uma linha em `MovimentoCreditoMaquininha`,
com `saldoAnterior` e `saldoPosterior` congelados — o razão é a fonte da
verdade e `saldoCredito` é a materialização dele. `valor` é **sempre
positivo**: o sinal vem do `tipo` (`RECARGA`, `CONSUMO`, `ESTORNO`,
`AJUSTE_CREDITO`, `AJUSTE_DEBITO`).

Três invariantes que não são convenção:

- **Débito e venda no mesmo commit.** `debitarVenda` e `estornarVenda` recebem
  o `tx` de quem chama e nunca abrem transação própria. Crédito insuficiente
  derruba a transação inteira: a venda não nasce e nenhuma cartela fica
  alocada.
- **A checagem de saldo mora dentro do UPDATE** (`updateMany` com
  `saldoCredito: { gte: valor }`). Ler o saldo e depois decrementar deixaria
  duas vendas simultâneas passarem com crédito para uma só.
- **`@@unique([vendaId, tipo])` e `@@unique([vendaSenaId, tipo])`** impedem
  débito ou estorno duplicado no banco, não no código. O estorno é guiado pelo
  razão ("existe CONSUMO sem ESTORNO?"), não pelo status da venda — venda
  MANUAL nasce APROVADO e nunca passa por PENDENTE.

Só o ADMIN concede limite (`PATCH /admin/maquininhas/:id/limite`) e lança
recarga ou ajuste (`POST /admin/maquininhas/:id/creditos`); `CONSUMO` e
`ESTORNO` não são aceitos nessa rota, porque nascem da venda. DISTRIBUIDOR lê
o extrato da própria rede (`GET /admin/maquininhas/:id/creditos`).

---

### Compras e Combos
- **Compra Rápida**: Apenas a propriedade `quantidade` é requerida. O sistema travará bilhetes sequenciais não reservados. Caso não haja cartelas especificadas, utiliza `UMA_CHANCE` por padrão ou falha de forma graciosa retornando strings vazias ou nulas pelo service (ex: ao invés de lançar erro 400).
- **Compra Manuais / Combos Específicos**: Payload aceita Array simples de strings com os ids formatados: `combosSelecionados: ["122340", "122355"]`. O Prisma aloca estritamente essas chaves. Tratamento de Erros via Exceções (BadRequestException) dentro de Try/Catch mapeados nos endpoints para retornar `"combos": []` na pesquisa do frontend.

---

## Testes

- Criar arquivo `.spec.ts` para todo service criado
- Mockar Prisma com `jest.mock` ou `jest-mock-extended`
- Cobertura mínima de **70%** nos services

---

## Padrão de Commits (em português)

| Tipo | Uso |
|------|-----|
| `feat:` | Nova funcionalidade |
| `fix:` | Correção de bug |
| `refactor:` | Refatoração sem mudança de comportamento |
| `docs:` | Documentação |
| `test:` | Testes |
| `chore:` | Configuração e tarefas de manutenção |

Exemplos:
```
feat: adicionar endpoint de criação de vendedor
fix: corrigir cálculo de comissão ao aprovar venda
test: adicionar spec do VendasService
```

---

## Estrutura de Módulo (padrão)

```
modules/nome-do-modulo/
  dto/
    create-nome.dto.ts
    update-nome.dto.ts
  nome.controller.ts
  nome.service.ts
  nome.module.ts
  nome.service.spec.ts
```

---

## Variáveis de Ambiente

Nunca usar `process.env.VARIAVEL` diretamente. Sempre injetar via `ConfigService`:

```typescript
constructor(private readonly config: ConfigService) {}

const value = this.config.get<string>('JWT_ACCESS_SECRET');
```

---

## Sorteio (Lembrete)

- O sorteio atua **ESTRITAMENTE** pelo Firebase Firestore (`Admin SDK` -> `Client Web`).
- WebSockets (`socket.io` ou gatewyes nativos do nest) foram **banidos** por restrições operacionais e substituídos 100% pelas streams sub/pub do Firestore Database `collections('sorteios')`.

---

## Scripts Disponíveis

```bash
npm run start:dev        # desenvolvimento com watch
npm run build            # build produção
npm run prisma:migrate   # executar migrations
npm run prisma:seed      # popular banco com dados de exemplo
npm run prisma:studio    # abrir Prisma Studio
npm run test             # unit tests
npm run test:cov         # unit tests com cobertura
npm run test:e2e         # testes end-to-end
```
