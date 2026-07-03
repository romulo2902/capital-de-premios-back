-- AlterTable
ALTER TABLE "Distribuidor" ADD COLUMN     "comissaoPercent" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ComissaoDistribuidor" (
    "id" TEXT NOT NULL,
    "distribuidorId" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "valor" DECIMAL(65,30) NOT NULL,
    "status" "StatusComissao" NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComissaoDistribuidor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComissaoDistribuidor_vendaId_key" ON "ComissaoDistribuidor"("vendaId");

-- AddForeignKey
ALTER TABLE "ComissaoDistribuidor" ADD CONSTRAINT "ComissaoDistribuidor_distribuidorId_fkey" FOREIGN KEY ("distribuidorId") REFERENCES "Distribuidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComissaoDistribuidor" ADD CONSTRAINT "ComissaoDistribuidor_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
