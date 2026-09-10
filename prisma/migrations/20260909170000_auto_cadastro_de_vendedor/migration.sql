-- Auto-cadastro de vendedor por link do distribuidor.
--
-- Duas colunas, uma para cada ponta do fluxo: o token que identifica a rede na
-- URL publica, e a marca de aprovacao que separa "aguardando o distribuidor"
-- de "inativado por ele" -- os dois estados compartilham `status = INATIVO`.

-- AlterTable
-- Entra nullable para nao travar na tabela existente, e vira NOT NULL depois do
-- backfill. O DEFAULT no banco espelha o `@default(uuid())` do schema: sem ele,
-- todo `distribuidor.create` do codigo — seeds e migracao de dados inclusive —
-- teria que passar o token na mao. `gen_random_uuid()` e nativa no PG 13+.
ALTER TABLE "Distribuidor" ADD COLUMN "tokenCadastro" TEXT;

UPDATE "Distribuidor"
SET "tokenCadastro" = gen_random_uuid()::text
WHERE "tokenCadastro" IS NULL;

ALTER TABLE "Distribuidor" ALTER COLUMN "tokenCadastro" SET NOT NULL;

-- O `@default(uuid())` do Prisma e resolvido no cliente, nao no banco. O
-- DEFAULT aqui cobre quem insere por SQL cru — seed manual, restore, seed via
-- psql —, que de outro jeito esbarraria no NOT NULL.
ALTER TABLE "Distribuidor"
ALTER COLUMN "tokenCadastro" SET DEFAULT gen_random_uuid()::text;

-- CreateIndex
-- Unico porque o token e a chave de busca da rota publica: duas redes com o
-- mesmo token fariam o cadastro cair na rede errada.
CREATE UNIQUE INDEX "Distribuidor_tokenCadastro_key" ON "Distribuidor"("tokenCadastro");

-- AlterTable
-- Nullable sem default nao reescreve a tabela (PG 11+).
ALTER TABLE "Vendedor" ADD COLUMN "aprovadoEm" TIMESTAMP(3);

-- Todo vendedor que ja existe foi cadastrado por um distribuidor ou pelo POS,
-- ou seja, ja passou por aprovacao humana. Deixa-los nulos os faria aparecer
-- como pendentes na primeira abertura da tela.
UPDATE "Vendedor" SET "aprovadoEm" = "createdAt" WHERE "aprovadoEm" IS NULL;
