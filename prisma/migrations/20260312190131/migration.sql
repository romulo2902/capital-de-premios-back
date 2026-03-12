-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "distribuidorId" TEXT;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_distribuidorId_fkey" FOREIGN KEY ("distribuidorId") REFERENCES "Distribuidor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
