-- Exclusão lógica de maquininha, privilégio do ADMIN.
--
-- Estado distinto de `status: INATIVA`: inativa é aparelho fora de operação que
-- segue na frota e o distribuidor pode reativar; excluída sai da frota e some
-- de toda listagem, inclusive do seletor do POS.
--
-- Não existe DELETE físico aqui porque `MovimentoCreditoMaquininha` referencia
-- a maquininha com ON DELETE RESTRICT — apagar de verdade quebraria o razão de
-- crédito, que é a fonte da verdade do saldo.
--
-- `numeroSerie` segue único GLOBAL, incluindo excluídas: um aparelho físico
-- existe uma vez só, e liberar a série de uma excluída deixaria o mesmo
-- aparelho com dois históricos de crédito. Recadastrar responde 409 dizendo
-- que a série pertence a um aparelho excluído.

-- AlterTable
-- Coluna nullable sem default não reescreve a tabela (PG 11+).
ALTER TABLE "Maquininha" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
-- Toda leitura de maquininha passa a filtrar `deletedAt IS NULL`. Sem índice,
-- esse filtro vira varredura da tabela inteira conforme a frota cresce.
CREATE INDEX "Maquininha_deletedAt_idx" ON "Maquininha"("deletedAt");
