# Capital de Premios API

API em NestJS para o sistema Capital de Premios, com Postgres, Prisma e Redis.

**Stack**
- Node.js 20 + TypeScript (strict)
- NestJS 10
- Prisma 6 + PostgreSQL
- Redis + BullMQ
- Swagger/OpenAPI

## Requisitos

- Node.js 20
- Yarn
- PostgreSQL 16
- Redis 7

Se preferir, use Docker para subir Postgres e Redis.

## Setup rapido (Docker)

1. Suba os servicos de banco e cache:
```bash
docker-compose up -d
```

2. Ajuste o `.env.development`:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/capital_premios_db
REDIS_URL=redis://localhost:6379
```

3. Instale dependencias:
```bash
yarn
```

4. Gere o Prisma Client e rode as migrations:
```bash
yarn prisma:generate
yarn prisma:migrate
```

5. (Opcional) Seed:
```bash
yarn prisma:seed
```

6. Suba a API:
```bash
yarn start:dev
```

## Setup local (Postgres e Redis ja instalados)

1. Ajuste o `.env.development` com suas credenciais locais.
2. Instale dependencias:
```bash
yarn
```
3. Gere o Prisma Client e rode as migrations:
```bash
yarn prisma:generate
yarn prisma:migrate
```
4. Suba a API:
```bash
yarn start:dev
```

## Variaveis de ambiente

- Baseie-se no `.env.example`
- O projeto usa `.env.development` por padrao nos scripts do Prisma
- Ajuste `DATABASE_URL` e `REDIS_URL` conforme seu ambiente

## Comandos principais

- `yarn start:dev` desenvolvimento com watch
- `yarn build` build de producao
- `yarn prisma:migrate` cria e aplica migrations
- `yarn prisma:generate` gera o Prisma Client
- `yarn prisma:seed` popula dados de exemplo
- `yarn prisma:studio` abre o Prisma Studio
- `yarn test` tests unitarios
- `yarn test:cov` cobertura

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

