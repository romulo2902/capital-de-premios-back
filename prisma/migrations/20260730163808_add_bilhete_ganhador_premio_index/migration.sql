-- Índice para GET /loja/ganhadores (Hall da Fama), que filtra por
-- ganhador + premioId. Sem ele a consulta faz Seq Scan em "Bilhete", tabela
-- que cresce a cada bilhete vendido — e o endpoint é público, sem auth.
--
-- IF NOT EXISTS de propósito: em produção, com a tabela já grande, o CREATE
-- INDEX comum trava escritas enquanto roda. Nesse caso, crie o índice antes do
-- deploy com CREATE INDEX CONCURRENTLY (que não roda dentro da transação do
-- migrate) e esta migration passa direto:
--
--   CREATE INDEX CONCURRENTLY "Bilhete_ganhador_premioId_idx"
--     ON "Bilhete"("ganhador", "premioId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Bilhete_ganhador_premioId_idx" ON "Bilhete"("ganhador", "premioId");
