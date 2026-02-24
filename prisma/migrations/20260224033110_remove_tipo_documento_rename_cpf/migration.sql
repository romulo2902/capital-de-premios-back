/*
  Warnings:

  - You are about to drop the column `documento` on the `Distribuidor` table. All the data in the column will be lost.
  - You are about to drop the column `tipoDocumento` on the `Distribuidor` table. All the data in the column will be lost.
  - You are about to drop the column `documento` on the `Vendedor` table. All the data in the column will be lost.
  - You are about to drop the column `tipoDocumento` on the `Vendedor` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[cpf]` on the table `Distribuidor` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[cpf]` on the table `Vendedor` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `cpf` to the `Distribuidor` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cpf` to the `Vendedor` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Distribuidor_documento_key";

-- DropIndex
DROP INDEX "Vendedor_documento_key";

-- AlterTable
ALTER TABLE "Distribuidor" DROP COLUMN "documento",
DROP COLUMN "tipoDocumento",
ADD COLUMN     "cpf" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Vendedor" DROP COLUMN "documento",
DROP COLUMN "tipoDocumento",
ADD COLUMN     "cpf" TEXT NOT NULL;

-- DropEnum
DROP TYPE "TipoDocumento";

-- CreateIndex
CREATE UNIQUE INDEX "Distribuidor_cpf_key" ON "Distribuidor"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Vendedor_cpf_key" ON "Vendedor"("cpf");
