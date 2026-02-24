/*
  Warnings:

  - You are about to drop the column `cpf` on the `Distribuidor` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[documento]` on the table `Distribuidor` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[documento]` on the table `Vendedor` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `documento` to the `Distribuidor` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tipoDocumento` to the `Distribuidor` table without a default value. This is not possible if the table is not empty.
  - Added the required column `documento` to the `Vendedor` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tipoDocumento` to the `Vendedor` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('CPF', 'CNPJ');

-- DropIndex
DROP INDEX "Distribuidor_cpf_key";

-- AlterTable
ALTER TABLE "Distribuidor" DROP COLUMN "cpf",
ADD COLUMN     "documento" TEXT NOT NULL,
ADD COLUMN     "tipoDocumento" "TipoDocumento" NOT NULL;

-- AlterTable
ALTER TABLE "Vendedor" ADD COLUMN     "documento" TEXT NOT NULL,
ADD COLUMN     "tipoDocumento" "TipoDocumento" NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Distribuidor_documento_key" ON "Distribuidor"("documento");

-- CreateIndex
CREATE UNIQUE INDEX "Vendedor_documento_key" ON "Vendedor"("documento");
