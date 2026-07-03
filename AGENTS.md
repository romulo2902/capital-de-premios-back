# AGENTS.md — Capital de Prêmios API

Este arquivo guia agentes de IA (OpenAI Codex, GPT-4o, etc.) sobre as convenções e regras deste projeto.

---

## Stack

- **Runtime**: Node.js 20 + TypeScript (strict)
- **Framework**: NestJS 10
- **ORM**: Prisma 6 + PostgreSQL
- **Auth**: JWT (access + refresh), bcrypt
- **Docs**: Swagger/OpenAPI (`@nestjs/swagger`)
- **Tempo Real**: Firebase Firestore (Admin SDK no backend, Client SDK no frontend)
  - Sorteio transmite números em tempo real via Firestore. **WebSocket foi 100% banido.**
- **Dev**: `npm run start:dev` | Build: `npm run build`

---

## Convenções de Nomenclatura

| Contexto | Padrão |
|----------|--------|
| Variáveis e funções | `camelCase` |
| Classes, interfaces, enums | `PascalCase` |
| Arquivos e pastas | `kebab-case` |
| Constantes | `UPPER_SNAKE_CASE` |

---

## Padrões NestJS — OBRIGATÓRIO

1. **DTOs** — toda entrada de dados usa `class-validator` + decorators do Swagger:
   ```typescript
   @ApiProperty({ example: '12345678900', description: 'CPF do cliente' })
   @Matches(/^\d{11}$/)
   cpf: string;
   ```

2. **Swagger** — sempre atualizar ao modificar rotas ou DTOs:
   - `@ApiTags('Modulo')` no controller
   - `@ApiOperation({ summary: '...' })` em cada método
   - `@ApiQuery(...)` para query params
   - `@ApiBearerAuth()` em rotas protegidas

3. **Logger** — obrigatório em todo service:
   ```typescript
   private readonly logger = new Logger(NomeDoService.name);
   ```

4. **Variáveis de ambiente** — sempre via `ConfigService`, nunca `process.env`:
   ```typescript
   this.config.get<string>('JWT_ACCESS_SECRET')
   ```

5. **IDs** — sempre UUID:
   ```prisma
   id String @id @default(uuid())
   ```

6. **Guards** — todas as rotas protegidas:
   ```typescript
   @UseGuards(JwtAuthGuard, RolesGuard)
   @Roles('ADMIN', 'DISTRIBUIDOR')
   ```

7. **Transações Prisma** — obrigatório em operações multi-tabela:
   ```typescript
   await this.prisma.$transaction(async (tx) => { ... });
   ```

8. **Tipagem** — nunca usar `any`. Tipar tudo explicitamente.

9. **TypeError / erros de tipo** — sempre validar erros de tipagem antes de concluir qualquer alteração:
   - Rodar validação de build/typecheck após mudanças relevantes
   - Não encerrar tarefa com `TS2339`, `TS2353`, incompatibilidade de DTO/Prisma, ou tipos desatualizados
   - Se houver mudança em `schema.prisma`, validar também `prisma:generate` antes do build

---

## Contextos de Acesso

| Endpoint | Perfis | Autenticação |
|----------|--------|-------------|
| `POST /auth/login` | ADMIN, DISTRIBUIDOR | Email + Senha |
| `POST /auth/loja` | VENDEDOR (email+senha) / CLIENTE (CPF) | Misto |

### Hierarquia de Cadastro
```
ADMIN → cadastra → DISTRIBUIDOR → cadastra → VENDEDOR
CLIENTE → auto-cadastra por CPF no primeiro acesso/compra
```

- **Cliente é criado quando o pagamento é aprovado**, não antes
- `Venda.vendedorId` / `Venda.distribuidorId` rastreiam a origem da compra para comissão. O Back-end as associa **automaticamente** via `@CurrentUser` quando a venda ocorre no painel admin `(POST /admin/vendas)`.
- Faturamento suporta Compra Rápida (quantidade X aleatória na ponta do banco) e Combos Selecionados (`combosSelecionados: string[]`).

---

## Estrutura de Módulos

```
src/modules/
  auth/          → login, refresh, JWT strategy
  usuarios/      → CRUD usuários sistema
  distribuidores/ → CRUD distribuidores (ADMIN cadastra)
  vendedores/    → CRUD vendedores (DISTRIBUIDOR cadastra)
  clientes/      → CRUD clientes (auto-criado na compra)
  edicoes/       → edições/sorteios
  vendas/        → processamento de compras
  pagamentos/    → webhook gateway de pagamento
  sorteio/       → lógica do sorteio exclusiva via Firebase
  comissoes/     → comissões de vendedores
  saques/        → solicitações de saque
  relatorios/    → Excel/PDF
  dashboard/     → métricas gerais
  qrcode/        → geração de QR codes
  migracao/      → importação em massa (CSV/XLSX)
```

---

## Padrão de Resposta

```typescript
// Sucesso
{ statusCode: 200, message: 'Operação realizada', data: T }

// Erro (lançar sempre via NestJS exceptions)
throw new NotFoundException('Recurso não encontrado');
throw new ConflictException('Documento já cadastrado');
throw new UnauthorizedException('Credenciais inválidas');
```

---

## Prisma — Comandos de Desenvolvimento

```bash
npm run prisma:migrate   # cria e aplica migration
npm run prisma:generate  # regenera o Prisma Client
npm run prisma:seed      # popula dados de exemplo
npm run prisma:reset     # reseta banco e reseed (dev only)
npm run prisma:studio    # abre GUI do banco
```

> **Atenção**: após alterar `schema.prisma`, sempre rodar `prisma:generate` para atualizar os tipos.

---

## Testes

```bash
npm run test         # unit tests
npm run test:cov     # coverage (mínimo 70% nos services)
```

- Mockar Prisma com `jest-mock-extended`
- Arquivo `.spec.ts` para todo service criado

---

## Commits (português)

```
feat: nova funcionalidade
fix: correção de bug
refactor: refatoração sem mudança de comportamento
docs: documentação
test: testes
chore: configuração e manutenção
```
