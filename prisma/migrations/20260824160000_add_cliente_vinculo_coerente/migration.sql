-- Coerência do vínculo comercial do Cliente — parte 1 de 2.
--
-- `Cliente.vendedorId` e `Cliente.distribuidorId` são colunas nullable
-- independentes, então o banco aceitava o par incoerente
-- (vendedorId preenchido, distribuidorId nulo) — estado impossível no domínio,
-- já que todo Vendedor pertence obrigatoriamente a um Distribuidor.
--
-- A regra era mantida só por convenção nos services. A importação em massa
-- (MigracaoService) não a aplicava, e qualquer caminho novo escapava sem aviso.

-- 1) Backfill: deriva o distribuidor a partir do vendedor.
--
-- Toca apenas as linhas incoerentes, então pega lock só nelas. Não vale a pena
-- quebrar em lotes aqui: o Prisma roda a migration inteira numa transação, e
-- lotes dentro da mesma transação não liberam lock entre iterações.
UPDATE "Cliente" c
SET "distribuidorId" = v."distribuidorId"
FROM "Vendedor" v
WHERE c."vendedorId" = v.id
  AND c."distribuidorId" IS NULL;

-- 2) Constraint, sem validar agora.
--
-- `NOT VALID` faz o ADD CONSTRAINT pegar ACCESS EXCLUSIVE apenas pelo instante
-- da alteração do catálogo, sem varrer a tabela — a partir daqui toda escrita
-- nova já é verificada. A varredura das linhas antigas fica para a migration
-- seguinte, que roda em outra transação: se as duas instruções estivessem
-- neste mesmo arquivo, o ACCESS EXCLUSIVE seria mantido até o commit e a
-- tabela ficaria bloqueada durante a validação inteira.
--
-- Os outros três estados seguem válidos:
--   (null, null) — cliente órfão: loja pública sem seller_id, ou importação
--   (null, D)    — captado direto pelo link do distribuidor
--   (V, D)       — captado por um vendedor
--
-- Não valida que V e D concordem: por decisão de projeto o valor explícito
-- vence (ver resolverVinculoCliente). Isso é invariante entre tabelas e
-- exigiria trigger; a coerência é garantida nos controllers.
--
-- LIMITAÇÃO CONHECIDA — apagar um Distribuidor pode falhar por causa desta
-- constraint. `Cliente_distribuidorId_fkey` é `ON DELETE SET NULL`, então o
-- DELETE tenta zerar `Cliente.distribuidorId`; num cliente que tem vendedor
-- isso produz o par (vendedor, null) e o CHECK aborta a operação inteira.
-- O erro cita `Cliente_vinculo_coerente` em vez do vínculo que bloqueia.
--
-- Só acontece com o par cruzado (vendedor da rede A + distribuidor B), que a
-- regra do valor explícito permite: fora dele, a FK `Vendedor_distribuidorId_fkey`
-- obriga a remover os vendedores antes, e isso já zera `Cliente.vendedorId`.
--
-- Nenhum caminho da API é afetado: `DistribuidoresService.remove` é soft
-- delete (`status: INATIVO`). Vale para limpeza manual (psql/Prisma Studio),
-- scripts de dados e para quem for implementar hard delete. Saída: limpar
-- `Cliente.vendedorId` desses clientes antes de apagar o distribuidor.
ALTER TABLE "Cliente"
  ADD CONSTRAINT "Cliente_vinculo_coerente"
  CHECK ("vendedorId" IS NULL OR "distribuidorId" IS NOT NULL)
  NOT VALID;
