-- Distância entre os títulos de uma mesma cartela multi-chance.
-- Default 1 preserva o comportamento das edições já cadastradas (títulos
-- consecutivos); edições novas devem informar o intervalo do Plano de Operação.
ALTER TABLE "Edicao" ADD COLUMN "intervalo" BIGINT NOT NULL DEFAULT 1;
