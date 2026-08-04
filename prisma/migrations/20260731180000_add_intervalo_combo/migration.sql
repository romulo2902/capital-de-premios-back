-- Distância entre os títulos de uma mesma cartela multi-chance.
-- Fica no combo porque cada produto (2x, 4x, 8x) tem o seu intervalo.
-- Default 1 preserva o comportamento dos combos já cadastrados (títulos
-- consecutivos); combos novos devem informar o intervalo do Plano de Operação.
ALTER TABLE "EdicaoCombo" ADD COLUMN "intervalo" BIGINT NOT NULL DEFAULT 1;
