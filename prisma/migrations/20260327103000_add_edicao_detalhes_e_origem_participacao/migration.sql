-- CreateEnum
CREATE TYPE "DestinoEdicao" AS ENUM ('SITE', 'LOJA_FISICA', 'AMBOS');

-- CreateEnum
CREATE TYPE "OrigemParticipacao" AS ENUM ('DIGITAL', 'FISICA');

-- CreateEnum
CREATE TYPE "TipoCartela" AS ENUM (
    'UMA_CHANCE',
    'DUAS_CHANCES',
    'TRES_CHANCES',
    'QUATRO_CHANCES',
    'CINCO_CHANCES',
    'SEIS_CHANCES',
    'SETE_CHANCES',
    'OITO_CHANCES',
    'NOVE_CHANCES',
    'DEZ_CHANCES',
    'ONZE_CHANCES',
    'DOZE_CHANCES'
);

-- AlterTable
ALTER TABLE "Edicao"
ADD COLUMN     "destino" "DestinoEdicao" NOT NULL DEFAULT 'SITE',
ADD COLUMN     "raspadinha" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Edicao" ALTER COLUMN "especie" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Venda"
ADD COLUMN     "origemParticipacao" "OrigemParticipacao" NOT NULL DEFAULT 'DIGITAL';

-- CreateTable
CREATE TABLE "EdicaoDetalhe" (
    "id" TEXT NOT NULL,
    "edicaoId" TEXT NOT NULL,
    "origemParticipacao" "OrigemParticipacao" NOT NULL,
    "tipoCartela" "TipoCartela" NOT NULL,
    "rangeInicio" BIGINT NOT NULL,
    "rangeFinal" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EdicaoDetalhe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EdicaoDetalhe_edicaoId_idx" ON "EdicaoDetalhe"("edicaoId");

-- CreateIndex
CREATE UNIQUE INDEX "EdicaoDetalhe_edicaoId_origemParticipacao_tipoCartela_range_key"
ON "EdicaoDetalhe"("edicaoId", "origemParticipacao", "tipoCartela", "rangeInicio", "rangeFinal");

-- AddForeignKey
ALTER TABLE "EdicaoDetalhe"
ADD CONSTRAINT "EdicaoDetalhe_edicaoId_fkey"
FOREIGN KEY ("edicaoId") REFERENCES "Edicao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
