-- Exclusão lógica de vendedor e distribuidor, privilégio do ADMIN.
--
-- Estado distinto de `status: INATIVO`: inativo é cadastro desligado que segue
-- na listagem e é reativado pelo PATCH; excluído some de toda listagem e do
-- seletor do POS. No vendedor também é distinto de `rejeitadoEm`, que marca
-- auto-cadastro negado e ainda pode ser aprovado.
--
-- Não existe DELETE físico aqui porque Venda, Comissao, Saque e Maquininha
-- referenciam essas linhas — apagar de verdade levaria junto o histórico de
-- vendas e comissões, que é o que a inativação lógica existe para preservar.
--
-- Excluir também grava `status = 'INATIVO'` na linha e no `Usuario`, na mesma
-- transação. Não é redundância: é o que faz todo caminho que já filtra
-- `status` — login do painel, POS, venda — barrar o excluído sem precisar
-- conhecer o `deletedAt`.
--
-- `cpf` e `email` seguem únicos GLOBAIS, incluindo excluídos: a pessoa existe
-- uma vez só, e liberar o CPF de um excluído deixaria a mesma pessoa com dois
-- históricos de comissão. Recadastrar responde 409 dizendo que o CPF pertence
-- a um cadastro excluído, e o caminho de volta é restaurar.

-- AlterTable
-- Coluna nullable sem default não reescreve a tabela (PG 11+). Nenhum backfill:
-- não existe exclusão anterior a esta migration, então todo cadastro já
-- existente está não-excluído, que é exatamente o NULL.
ALTER TABLE "Vendedor" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Distribuidor" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
-- Toda leitura dos dois módulos passa a filtrar `deletedAt IS NULL`. Sem
-- índice, esse filtro vira varredura da tabela inteira conforme a base cresce.
CREATE INDEX "Vendedor_deletedAt_idx" ON "Vendedor"("deletedAt");

-- CreateIndex
CREATE INDEX "Distribuidor_deletedAt_idx" ON "Distribuidor"("deletedAt");
