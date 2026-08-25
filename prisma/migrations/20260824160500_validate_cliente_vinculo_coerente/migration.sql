-- Coerência do vínculo comercial do Cliente — parte 2 de 2.
--
-- Valida as linhas que já existiam quando a constraint foi criada como
-- NOT VALID. Arquivo separado de propósito: cada migration do Prisma roda na
-- própria transação, então o ACCESS EXCLUSIVE da parte 1 já foi liberado.
--
-- VALIDATE CONSTRAINT pega apenas SHARE UPDATE EXCLUSIVE: a varredura completa
-- da tabela acontece sem bloquear SELECT, INSERT, UPDATE nem DELETE. Só outro
-- DDL sobre a mesma tabela espera.
ALTER TABLE "Cliente" VALIDATE CONSTRAINT "Cliente_vinculo_coerente";
