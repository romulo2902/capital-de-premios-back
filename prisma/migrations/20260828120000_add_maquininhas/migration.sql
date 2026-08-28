-- Maquininhas de cartão da rede — parte 1 de 2.
--
-- A maquininha é cadastrada pelo distribuidor no terminal POS e compartilhada
-- entre os vendedores da própria rede (N:N via `_MaquininhaToVendedor`).
--
-- `Venda.maquininhaId` e `VendaSena.maquininhaId` nascem nullable e só são
-- preenchidos pelo canal POS: nos demais canais o campo sequer é exposto nos
-- DTOs de venda, então continua null.

-- CreateEnum
CREATE TYPE "StatusMaquininha" AS ENUM ('ATIVA', 'INATIVA');

-- CreateTable
CREATE TABLE "Maquininha" (
    "id" TEXT NOT NULL,
    "distribuidorId" TEXT NOT NULL,
    "numeroSerie" TEXT NOT NULL,
    "apelido" TEXT,
    "operadora" TEXT,
    "status" "StatusMaquininha" NOT NULL DEFAULT 'ATIVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Maquininha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_MaquininhaToVendedor" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MaquininhaToVendedor_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
-- Serial é único global: um aparelho físico existe uma vez só, então uma rede
-- não consegue cadastrar a maquininha que já está em outra.
CREATE UNIQUE INDEX "Maquininha_numeroSerie_key" ON "Maquininha"("numeroSerie");

-- CreateIndex
-- Cobre a consulta do POS ("maquininhas ativas da minha rede") e, pelo prefixo,
-- o filtro só por distribuidorId — por isso não há índice isolado.
CREATE INDEX "Maquininha_distribuidorId_status_idx" ON "Maquininha"("distribuidorId", "status");

-- CreateIndex
CREATE INDEX "_MaquininhaToVendedor_B_index" ON "_MaquininhaToVendedor"("B");

-- AddForeignKey
-- Tabelas novas e vazias: validar agora não custa varredura.
ALTER TABLE "Maquininha" ADD CONSTRAINT "Maquininha_distribuidorId_fkey" FOREIGN KEY ("distribuidorId") REFERENCES "Distribuidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "_MaquininhaToVendedor" ADD CONSTRAINT "_MaquininhaToVendedor_A_fkey" FOREIGN KEY ("A") REFERENCES "Maquininha"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_MaquininhaToVendedor" ADD CONSTRAINT "_MaquininhaToVendedor_B_fkey" FOREIGN KEY ("B") REFERENCES "Vendedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
-- Coluna nullable sem default não reescreve a tabela (PG 11+).
ALTER TABLE "Venda" ADD COLUMN "maquininhaId" TEXT;
ALTER TABLE "VendaSena" ADD COLUMN "maquininhaId" TEXT;

-- AddForeignKey
--
-- `NOT VALID` aqui pelo mesmo motivo da migration do Cliente: `Venda` recebe
-- escrita a cada venda e um ADD CONSTRAINT validando na hora pegaria ACCESS
-- EXCLUSIVE durante a varredura inteira, bloqueando leitura e escrita. Assim o
-- catálogo muda num instante e toda linha nova já é verificada; a varredura das
-- antigas (todas null) fica para a migration seguinte, em outra transação.
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_maquininhaId_fkey" FOREIGN KEY ("maquininhaId") REFERENCES "Maquininha"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "VendaSena" ADD CONSTRAINT "VendaSena_maquininhaId_fkey" FOREIGN KEY ("maquininhaId") REFERENCES "Maquininha"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
