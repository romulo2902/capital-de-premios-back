-- Maquininhas de cartão da rede — parte 2 de 2.
--
-- Valida as FKs criadas como NOT VALID na migration anterior. `VALIDATE
-- CONSTRAINT` pega SHARE UPDATE EXCLUSIVE, que não bloqueia leitura nem
-- escrita — por isso a varredura fica aqui, e não junto do ADD CONSTRAINT.
--
-- Na prática a varredura é trivial: toda linha existente tem maquininhaId null.

ALTER TABLE "Venda" VALIDATE CONSTRAINT "Venda_maquininhaId_fkey";
ALTER TABLE "VendaSena" VALIDATE CONSTRAINT "VendaSena_maquininhaId_fkey";
