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
- **Sempre** usar `@ApiProperty()` do Swagger em todos os campos de DTO
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

## Autenticação

- **Loja (frontend cliente):** autenticação por CPF (sem senha), retorna JWT
- **Painel (admin/vendedor):** autenticação por email + senha com JWT access/refresh token

---

## Hierarquia de Perfis

```
ADMIN → DISTRIBUIDOR → VENDEDOR → CLIENTE
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
