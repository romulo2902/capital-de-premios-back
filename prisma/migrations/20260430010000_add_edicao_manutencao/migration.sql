-- AlterTable
ALTER TABLE "Edicao"
ADD COLUMN "manutencaoAtiva" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "manutencaoMensagem" TEXT;
