-- AlterTable
ALTER TABLE "Edicao" ALTER COLUMN "qtdNumerosCartela" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ResultadoPremio" (
    "id" TEXT NOT NULL,
    "premioId" TEXT NOT NULL,
    "edicaoId" TEXT NOT NULL,
    "numerosMarcados" INTEGER[],
    "ganhadorBilheteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResultadoPremio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResultadoPremio_premioId_key" ON "ResultadoPremio"("premioId");

-- CreateIndex
CREATE INDEX "ResultadoPremio_edicaoId_idx" ON "ResultadoPremio"("edicaoId");

-- AddForeignKey
ALTER TABLE "ResultadoPremio" ADD CONSTRAINT "ResultadoPremio_premioId_fkey" FOREIGN KEY ("premioId") REFERENCES "Premio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultadoPremio" ADD CONSTRAINT "ResultadoPremio_edicaoId_fkey" FOREIGN KEY ("edicaoId") REFERENCES "Edicao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
