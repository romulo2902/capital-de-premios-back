ALTER TABLE "Venda" ADD COLUMN "criadoPorId" TEXT;

CREATE INDEX "Venda_criadoPorId_idx" ON "Venda"("criadoPorId");

ALTER TABLE "Venda" ADD CONSTRAINT "Venda_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
