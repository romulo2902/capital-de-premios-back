/*
  Warnings:

  - The `codigo` column on the `Vendedor` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[codigo]` on the table `Cliente` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[codigo]` on the table `Distribuidor` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `Cliente` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Distribuidor` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Vendedor` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TipoChavePix" AS ENUM ('CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA');

-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "bairro" TEXT,
ADD COLUMN     "cep" TEXT,
ADD COLUMN     "codigo" SERIAL NOT NULL,
ADD COLUMN     "dataNascimento" TIMESTAMP(3),
ADD COLUMN     "endereco" TEXT,
ADD COLUMN     "numero" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "vendedorId" TEXT;

-- AlterTable
ALTER TABLE "Distribuidor" ADD COLUMN     "bairro" TEXT,
ADD COLUMN     "cep" TEXT,
ADD COLUMN     "chavePix" TEXT,
ADD COLUMN     "codigo" SERIAL NOT NULL,
ADD COLUMN     "dataNascimento" TIMESTAMP(3),
ADD COLUMN     "endereco" TEXT,
ADD COLUMN     "numero" TEXT,
ADD COLUMN     "saldo" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "tipoChavePix" "TipoChavePix",
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "cidade" DROP NOT NULL,
ALTER COLUMN "estado" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Vendedor" ADD COLUMN     "bairro" TEXT,
ADD COLUMN     "cep" TEXT,
ADD COLUMN     "chavePix" TEXT,
ADD COLUMN     "dataNascimento" TIMESTAMP(3),
ADD COLUMN     "endereco" TEXT,
ADD COLUMN     "nomeRecebedor" TEXT,
ADD COLUMN     "numero" TEXT,
ADD COLUMN     "saldo" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "tipoChavePix" "TipoChavePix",
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "codigo",
ADD COLUMN     "codigo" SERIAL NOT NULL,
ALTER COLUMN "cidade" DROP NOT NULL,
ALTER COLUMN "estado" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_codigo_key" ON "Cliente"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Distribuidor_codigo_key" ON "Distribuidor"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Vendedor_codigo_key" ON "Vendedor"("codigo");

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
