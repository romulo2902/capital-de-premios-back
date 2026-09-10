-- Recusa de auto-cadastro de vendedor.
--
-- `aprovadoEm` sozinho nao dava conta dos tres desfechos: um pendente ja nasce
-- INATIVO, entao recusar pelo DELETE gravava o status que o registro ja tinha e
-- o deixava indistinguivel de um pedido novo -- de volta na fila, e ainda
-- aprovavel. A coluna separa "recusado" de "aguardando".

-- AlterTable
-- Nullable sem default nao reescreve a tabela (PG 11+). Nenhum backfill: nao
-- existe recusa anterior a esta migration, e todo vendedor ja existente saiu do
-- backfill de `aprovadoEm`, ou seja, esta aprovado.
ALTER TABLE "Vendedor" ADD COLUMN "rejeitadoEm" TIMESTAMP(3);
