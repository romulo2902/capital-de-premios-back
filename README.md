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

- Docker + Docker Compose

Opcional (apenas para comandos utilitarios fora do container):

- Node.js 22+
- npm 10+

## Configuracao de ambiente

1. Crie seu arquivo `.env.development`:

```bash
cp .env.example .env.development
```

2. Ajuste `PORT`, `DATABASE_URL`, `REDIS_URL` e `FIREBASE_SERVICE_ACCOUNT_PATH`.

Exemplo:

```env
NODE_ENV=development
HOST=0.0.0.0
PORT=3000
DATABASE_URL=postgresql://capital_user:capital%40123@localhost:5432/capital_premios_db
REDIS_URL=redis://localhost:6379
FIREBASE_SERVICE_ACCOUNT_PATH=/home/jair/projetos/freela/capital-premios/firebase/capital-premios-efa1e-firebase-adminsdk-fbsvc-a3287399f9.json
```

Observacoes importantes:
- a API roda em `network_mode: host`, entao usa o mesmo `localhost` do seu WSL
- a porta da API vem do seu proprio `PORT` no `.env.development`
- o `docker-compose` monta a pasta de Firebase para respeitar o caminho de `FIREBASE_SERVICE_ACCOUNT_PATH`
- por padrao, o Compose sobe apenas a API. Postgres/Redis em container sao opcionais (`--profile infra`)

## Execucao com Docker

1. (Opcional) suba Postgres/Redis por Docker:

```bash
docker compose --profile infra up -d postgres redis
```

2. Suba a API:

```bash
npm run docker:up
```

3. Acompanhe logs:

```bash
npm run docker:logs
```

4. Healthcheck da API:

```bash
curl http://localhost:3000/api/health
```

5. Para desligar:

```bash
npm run docker:down
```

Observacao: o container `api` ja executa `npx prisma migrate deploy` antes de iniciar a aplicacao.

## Variaveis de ambiente

- Baseie-se no `.env.example`
- Para Docker local, use `.env.development`
- Para Docker em homolog/prod, use `.env.homolog` ou `.env.production`
- Ajuste `DATABASE_URL` e `REDIS_URL` conforme seu ambiente
- Configure `BULL_BOARD_USER` e `BULL_BOARD_PASS` para habilitar o painel visual de filas em `/api/admin/filas`
- Configure JWT, gateways de pagamento, AWS S3, Swagger (prod) e throttle

## Comandos principais

- `npm run docker:build` build da imagem da API
- `npm run docker:up` sobe/recria o container da API
- `npm run docker:down` para e remove containers
- `npm run docker:logs` acompanha logs da API
- `docker compose --profile infra up -d postgres redis` sobe infraestrutura local
- `docker compose exec api npx prisma migrate deploy` roda migration manualmente no container
- `http://localhost:3000/api/admin/filas` bull-board (quando `BULL_BOARD_USER/PASS` estiverem configurados)

## Documentacao da API

Em ambiente nao produtivo, a documentacao fica separada por contexto:

- indice: `http://localhost:3000/api/docs`
- redoc admin: `http://localhost:3000/api/docs/admin`
- redoc geral: `http://localhost:3000/api/docs/geral`
- swagger admin: `http://localhost:3000/api/swagger/admin`
- swagger geral: `http://localhost:3000/api/swagger/geral`
- json admin: `http://localhost:3000/api/docs-json/admin`
- json geral: `http://localhost:3000/api/docs-json/geral`

O indice `/api/docs` centraliza os atalhos. Use Redoc para leitura da referencia e Swagger para testes interativos das rotas.

## Padrao de Listagem

Todas as rotas de listagem paginada retornam o mesmo contrato para facilitar o consumo no frontend:

```json
{
  "statusCode": 200,
  "message": "Clientes listados com sucesso",
  "data": [
    {
      "id": "1",
      "nome": "Jair",
      "email": "jair@email.com"
    }
  ],
  "meta": {
    "total": 120,
    "page": 1,
    "limit": 10,
    "lastPage": 12
  }
}
```

Regras:

- endpoints de listagem nunca devem estourar erro apenas por nao encontrar itens
- quando nao houver registros, `data` vem vazio e `meta` continua presente
- `page` e `limit` sao aceitos nas rotas de listagem paginada
- `lastPage` sera `0` quando `total` for `0`

## Edicoes e Cartelas

O cadastro de edicoes/cartelas agora considera dois canais de participacao no mesmo sorteio:

- `DIGITAL`: compra pela loja, inclusive via link de vendedor ou distribuidor
- `FISICO` / `POS`: leitura de QR Code ou operacao presencial em loja fisica

Cada edicao possui um ou mais `detalhes` de cartela, com:

- `origemParticipacao`: `DIGITAL`, `FISICO` ou `POS` (equivale ao campo `especie`/tipo do admin)
- `tipoCartela`: de `UMA_CHANCE` ate `DOZE_CHANCES`
- `rangeInicio` e `rangeFinal`: minimo de 7 digitos
- `frase`: texto exibido no sorteio/cartela no admin

Regras aplicadas pela API:

- ranges nao podem se sobrepor entre detalhes da mesma edicao
- ranges nao podem ser reaproveitados entre edicoes diferentes
- uma mesma edicao pode concorrer com canais `DIGITAL` e `FISICO`/`POS`, desde que use ranges distintos
- quando a edicao tiver os dois canais, o `destino` deve ser `AMBOS`
- nunca existem duas edicoes em operacao ao mesmo tempo com status `ATIVA`, `ENCERRADA` ou `SORTEANDO`
- a edicao nasce desativada com status `RASCUNHO`
- salvar a edicao nao ativa automaticamente o sorteio
- a ativacao e a desativacao da edicao devem ocorrer pelos endpoints dedicados
- `dataSorteio` e `dataEncerramento` sao tratados com precisao de minuto
- formatos aceitos: `YYYY-MM-DDTHH:mm`, `DD/MM/YYYY HH:mm` ou ISO com fuso
- quando a data vier sem offset/fuso, a API interpreta no fuso `America/Sao_Paulo` por padrao
- segundos e milissegundos diferentes de zero sao rejeitados
- `dataEncerramento` deve ser estritamente anterior a `dataSorteio`

Impacto esperado no admin:

- a tela deve permitir adicionar mais de um bloco de detalhe de cartela por edicao
- cada bloco deve informar `origemParticipacao`/`especie`, `tipoCartela`, `rangeInicio` e `rangeFinal`
- o campo `destino` pode ser omitido pela interface; a API infere automaticamente `SITE`, `LOJA_FISICA` ou `AMBOS` com base nos detalhes enviados
- o payload de criacao pode enviar `status: RASCUNHO` para compatibilidade com o admin atual

## Comandos Prisma

```bash
# aplicar migrations pendentes (producao/homolog)
docker compose exec api npx prisma migrate deploy

# criar migration de desenvolvimento (quando necessario)
docker compose exec api npx prisma migrate dev

# gerar Prisma Client
docker compose exec api npx prisma generate

# reset completo do banco (cuidado: apaga dados)
docker compose exec api npx prisma migrate reset --force

# abre Prisma Studio
docker compose exec api npx prisma studio
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
docker compose exec api npx prisma migrate dev
docker compose exec api npx prisma db seed
```

### Solucao 2 (quando voce nao pode alterar permissoes)

Use um usuario de desenvolvimento com permissao de `CREATEDB`, ou rode as migracoes fora do fluxo `migrate dev` (ex.: pipeline com `prisma migrate deploy`).

## Rodando a API

```bash
npm run docker:up
```

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/api/docs` (somente fora de producao)

## Deploy com Docker (Homologacao/Producao)

1. Atualize o codigo e configure o arquivo de ambiente correto (`.env.homolog` ou `.env.production`).

2. Rebuild da imagem:

```bash
docker compose build api
```

3. Suba a API:

```bash
docker compose up -d api
```

4. Verifique os logs:

```bash
docker compose logs -f api
```

Observacoes:

- O container da API executa `npx prisma migrate deploy` no startup antes de subir o Nest.
- Se precisar rodar migration manualmente: `docker compose exec api npx prisma migrate deploy`.
- Se estiver usando Postgres/Redis locais no host, mantenha `network_mode: host` e URLs apontando para `localhost`.

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
