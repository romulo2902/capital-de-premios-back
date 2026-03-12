# Capital Premios API

API em NestJS para o sistema Capital de Premios, com Postgres, Prisma e Redis.

**Stack**
- Node.js 22 + TypeScript (strict)
- NestJS 11
- Prisma 6 + PostgreSQL
- Redis + BullMQ
- Swagger/OpenAPI
- AWS S3 (uploads)

## Requisitos

- Node.js 22+
- npm 10+
- PostgreSQL 16+
- Redis 7+

Opcional (para subir banco/redis por container):

- Docker + Docker Compose

## Configuracao de ambiente

1. Crie o arquivo de ambiente local:

```bash
cp .env.example .env.development
```

2. Ajuste o `DATABASE_URL` para o seu Postgres.

Exemplo:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/capital_premios_db
```

Se a senha tiver `@`, escape como `%40`.
Exemplo: `capital@123` -> `capital%40123`.

## Setup rapido (Docker)

1. Suba o Redis:

```bash
docker-compose up -d
```

2. Ajuste o `.env.development` (baseie-se no `.env.example`):

```env
DATABASE_URL=postgresql://user:password@seu-endpoint-rds:5432/capital_premios_db
REDIS_URL=redis://localhost:6379
```

3. Instale dependencias:

```bash
npm install
```

4. Gere o Prisma Client e rode as migrations:

```bash
npm run prisma:generate
npm run prisma:migrate
```

5. (Opcional) Seed:

```bash
npm run prisma:seed
```

6. Suba a API:

```bash
npm run start:dev
```

## Setup local (RDS + Redis ja instalados)

1. Ajuste o `.env.development` com suas credenciais locais.
2. Instale dependencias:

```bash
npm install
```

3. Gere o Prisma Client e rode as migrations:

```bash
npm run prisma:generate
npm run prisma:migrate
```

4. Suba a API:

```bash
npm run start:dev
```

## Subindo infraestrutura (opcional com Docker)

```bash
docker compose up -d
```

Observacao: o `docker-compose.yml` atual sobe Postgres com `user/password`.

## Variaveis de ambiente

- Baseie-se no `.env.example`
- O projeto usa `.env.development` por padrao nos scripts do Prisma
- Ajuste `DATABASE_URL` e `REDIS_URL` conforme seu ambiente
- Configure JWT, gateways de pagamento, AWS S3, Swagger (prod) e throttle

## Comandos principais

- `npm run start:dev` desenvolvimento com watch
- `npm run build` build de producao
- `npm run lint` lint do projeto
- `npm run format` formatacao do codigo
- `npm run prisma:migrate` cria e aplica migrations
- `npm run prisma:generate` gera o Prisma Client
- `npm run prisma:seed` popula dados de exemplo
- `npm run prisma:studio` abre o Prisma Studio
- `npm run test` tests unitarios
- `npm run test:watch` tests com watch
- `npm run test:cov` cobertura
- `npm run test:e2e` tests e2e

## Comandos Prisma

```bash
# cria/aplica migracao em ambiente local
npm run prisma:migrate

# gera client do Prisma
npm run prisma:generate

# popula dados iniciais
npm run prisma:seed

# reset completo do banco local (cuidado: apaga dados)
npm run prisma:reset

# abre Prisma Studio
npm run prisma:studio
```

## Erros comuns

**P3014: Prisma Migrate could not create the shadow database**

Isso acontece quando o usuario do Postgres nao tem permissao para criar bancos.

Opcoes:

1. Usar o Docker do projeto e ajustar a `DATABASE_URL` para `user:password`.
2. Conceder permissao `CREATEDB` ao usuario:

```sql
ALTER USER seu_usuario CREATEDB;
```

3. Usar um banco sombra manual com `SHADOW_DATABASE_URL`:

```env
SHADOW_DATABASE_URL=postgresql://usuario:senha@localhost:5432/capital_premios_shadow
```

E no `prisma/schema.prisma`:

```prisma
datasource db {
  provider          = "postgresql"
  url               = env("DATABASE_URL")
  shadowDatabaseUrl = env("SHADOW_DATABASE_URL")
}
```

### Solucao 1 (recomendada para desenvolvimento)

Conceda permissao ao usuario usado no `DATABASE_URL`:

```sql
ALTER ROLE user CREATEDB;
```

Se seu usuario for outro (ex.: `capital_user`):

```sql
ALTER ROLE capital_user CREATEDB;
```

Exemplo via terminal (ajuste o usuario administrador):

```bash
psql -h localhost -U postgres -d postgres -c "ALTER ROLE capital_user CREATEDB;"
```

Depois rode novamente:

```bash
npm run prisma:migrate
npm run prisma:seed
```

### Solucao 2 (quando voce nao pode alterar permissoes)

Use um usuario de desenvolvimento com permissao de `CREATEDB`, ou rode as migracoes fora do fluxo `migrate dev` (ex.: pipeline com `prisma migrate deploy`).

## Rodando a API

```bash
npm run start:dev
```

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/docs`

## Credenciais do seed

- Admin: `admin@capitalpremios.com` / `Admin@123`
- Distribuidor: `distribuidor@capitalpremios.com` / `Dist@123`
- Vendedor 1: `vendedor1@capitalpremios.com` / `Vend@123`
- Vendedor 2: `vendedor2@capitalpremios.com` / `Vend@123`

## Observacao sobre warning do Prisma

Warning atual:

```text
The configuration property package.json#prisma is deprecated and will be removed in Prisma 7
```

Esse aviso nao bloqueia execucao agora. Em uma etapa futura, migrar para `prisma.config.ts`.
