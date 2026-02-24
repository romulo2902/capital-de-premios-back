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
- **Sempre** que alterar uma rota, DTO ou regra de acesso, **atualizar** o Swagger correspondente:
  - `@ApiTags('...')` no controller
  - `@ApiOperation({ summary: '...' })` em cada endpoint
  - `@ApiQuery(...)` em parâmetros de query
  - `@ApiBearerAuth()` em rotas protegidas
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

- Todo `Vendedor` pertence obrigatoriamente a um `Distribuidor` (FK `distribuidorId`)
- `Cliente` acessa a loja via link de `Vendedor` ou `Distribuidor` — a venda registra `vendedorId` ou `distribuidorId` para cálculo de comissão
- **Cliente é criado automaticamente quando o pagamento é aprovado** (webhook do gateway) — nunca antes. O checkout coleta: CPF, Nome, E-mail, Celular, Data de Nascimento. O `VendasService` faz `upsert` do cliente ao processar o webhook de pagamento aprovado.

```typescript
// VendasService — executado no webhook de pagamento aprovado
const cliente = await prisma.cliente.upsert({
  where: { cpf: dto.cpf },
  update: { nome: dto.nome, email: dto.email, telefone: dto.telefone },
  create: { cpf: dto.cpf, nome: dto.nome, email: dto.email, telefone: dto.telefone,
            dataNascimento: dto.dataNascimento, vendedorId: dto.vendedorId },
});
```

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

## WebSocket (Sorteio)

- Room: `edicao-{id}`
- Autenticação JWT no handshake
- Eventos emitidos pelo servidor: `sorteio:numero_marcado`, `sorteio:ganhador`, `sorteio:status`, `sorteio:resultado_final`
- Eventos recebidos do admin: `sorteio:marcar_numero`

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
