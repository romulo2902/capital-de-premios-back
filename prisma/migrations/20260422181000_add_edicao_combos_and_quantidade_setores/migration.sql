-- AlterTable
ALTER TABLE "Edicao"
ALTER COLUMN "numero" TYPE TEXT
USING "numero"::TEXT;

-- DropIndex
DROP INDEX IF EXISTS "Edicao_numero_key";

-- AlterTable
ALTER TABLE "EdicaoDetalhe"
ADD COLUMN "indiceRange" INTEGER;

WITH detalhes_ordenados AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "edicaoId", "origemParticipacao"
      ORDER BY "rangeInicio" ASC, id ASC
    ) AS indice
  FROM "EdicaoDetalhe"
)
UPDATE "EdicaoDetalhe" d
SET "indiceRange" = detalhes_ordenados.indice
FROM detalhes_ordenados
WHERE d.id = detalhes_ordenados.id;

ALTER TABLE "EdicaoDetalhe"
ALTER COLUMN "indiceRange" SET NOT NULL;

ALTER TABLE "EdicaoDetalhe"
DROP COLUMN IF EXISTS "quantidadeSetores";

-- DropIndex
DROP INDEX IF EXISTS "EdicaoDetalhe_edicaoId_origemParticipacao_tipoCartela_range_key";

-- CreateIndex
CREATE UNIQUE INDEX "EdicaoDetalhe_edicaoId_origemParticipacao_indiceRange_key"
ON "EdicaoDetalhe"("edicaoId", "origemParticipacao", "indiceRange");

-- CreateTable
CREATE TABLE "EdicaoCombo" (
  "id" TEXT NOT NULL,
  "edicaoId" TEXT NOT NULL,
  "origemParticipacao" "OrigemParticipacao" NOT NULL,
  "tipoCartela" "TipoCartela" NOT NULL,
  "preco" DECIMAL(65,30) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EdicaoCombo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EdicaoCombo_edicaoId_idx" ON "EdicaoCombo"("edicaoId");

-- CreateIndex
CREATE UNIQUE INDEX "EdicaoCombo_edicaoId_origemParticipacao_tipoCartela_key" ON "EdicaoCombo"("edicaoId", "origemParticipacao", "tipoCartela");

-- AddForeignKey
ALTER TABLE "EdicaoCombo"
ADD CONSTRAINT "EdicaoCombo_edicaoId_fkey"
FOREIGN KEY ("edicaoId") REFERENCES "Edicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
