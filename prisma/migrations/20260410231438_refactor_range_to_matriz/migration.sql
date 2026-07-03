/*
  Warnings:

  - You are about to drop the column `rangeId` on the `Bilhete` table. All the data in the column will be lost.
  - You are about to drop the `Range` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[matrizId,edicaoId]` on the table `Bilhete` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `edicaoId` to the `Bilhete` table without a default value. This is not possible if the table is not empty.
  - Added the required column `matrizId` to the `Bilhete` table without a default value. This is not possible if the table is not empty.

*/

-- Limpar dados existentes para viabilizar a reestruturação da tabela Bilhete
DELETE FROM "Bilhete";

-- DropForeignKey
ALTER TABLE "Bilhete" DROP CONSTRAINT "Bilhete_rangeId_fkey";

-- AlterTable
ALTER TABLE "Bilhete" DROP COLUMN "rangeId",
ADD COLUMN     "edicaoId" TEXT NOT NULL,
ADD COLUMN     "matrizId" TEXT NOT NULL;

-- DropTable
DROP TABLE "Range";

-- CreateTable
CREATE TABLE "MatrizRange" (
    "id" TEXT NOT NULL,
    "numero" BIGINT NOT NULL,
    "sequenciaBolas" INTEGER[],

    CONSTRAINT "MatrizRange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatrizRange_numero_key" ON "MatrizRange"("numero");

-- CreateIndex
CREATE INDEX "Bilhete_edicaoId_idx" ON "Bilhete"("edicaoId");

-- CreateIndex
CREATE UNIQUE INDEX "Bilhete_matrizId_edicaoId_key" ON "Bilhete"("matrizId", "edicaoId");

-- AddForeignKey
ALTER TABLE "Bilhete" ADD CONSTRAINT "Bilhete_matrizId_fkey" FOREIGN KEY ("matrizId") REFERENCES "MatrizRange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
