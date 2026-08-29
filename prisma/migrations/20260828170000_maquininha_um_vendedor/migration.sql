-- Maquininha passa a ter um único vendedor.
--
-- O N:N (`_MaquininhaToVendedor`) foi substituído por uma FK nullable: cada
-- aparelho fica com no máximo um vendedor, e `NULL` significa "no estoque do
-- distribuidor", ainda sem ninguém operando.

-- AlterTable
ALTER TABLE "Maquininha" ADD COLUMN "vendedorId" TEXT;

-- Backfill antes do DROP, senão o vínculo existente se perde.
--
-- Aparelho que tenha mais de um vendedor no modelo antigo não cabe no novo:
-- ficamos com o menor id, de forma determinística, para a migration produzir o
-- mesmo resultado em qualquer ambiente. Os demais vínculos são descartados —
-- é a consequência esperada de estreitar a cardinalidade.
UPDATE "Maquininha" m
SET "vendedorId" = (
  SELECT MIN(mv."B")
  FROM "_MaquininhaToVendedor" mv
  WHERE mv."A" = m.id
);

-- CreateIndex
CREATE INDEX "Maquininha_vendedorId_idx" ON "Maquininha"("vendedorId");

-- AddForeignKey
-- Tabela pequena e recém-criada, e o backfill só gravou ids que vieram da
-- própria FK antiga: validar agora é barato e não precisa do NOT VALID.
ALTER TABLE "Maquininha" ADD CONSTRAINT "Maquininha_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "_MaquininhaToVendedor" DROP CONSTRAINT "_MaquininhaToVendedor_A_fkey";
ALTER TABLE "_MaquininhaToVendedor" DROP CONSTRAINT "_MaquininhaToVendedor_B_fkey";

-- DropTable
DROP TABLE "_MaquininhaToVendedor";
