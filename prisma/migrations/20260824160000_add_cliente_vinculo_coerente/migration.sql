-- Coerência do vínculo comercial do Cliente.
--
-- `Cliente.vendedorId` e `Cliente.distribuidorId` são colunas nullable
-- independentes, então o banco aceitava o par incoerente
-- (vendedorId preenchido, distribuidorId nulo) — estado impossível no domínio,
-- já que todo Vendedor pertence obrigatoriamente a um Distribuidor.
--
-- A regra era mantida só por convenção nos services. A importação em massa
-- (MigracaoService) não a aplicava, e qualquer caminho novo escapava sem aviso.
--
-- 1) Backfill: deriva o distribuidor a partir do vendedor.
UPDATE "Cliente" c
SET "distribuidorId" = v."distribuidorId"
FROM "Vendedor" v
WHERE c."vendedorId" = v.id
  AND c."distribuidorId" IS NULL;

-- 2) Constraint: o banco passa a recusar o par incoerente.
--
-- Os outros três estados seguem válidos:
--   (null, null) — cliente órfão: loja pública sem seller_id, ou importação
--   (null, D)    — captado direto pelo link do distribuidor
--   (V, D)       — captado por um vendedor
--
-- Não valida que V e D concordem: por decisão de projeto o valor explícito
-- vence (ver resolverVinculoCliente). Isso é invariante entre tabelas e
-- exigiria trigger; a coerência é garantida nos controllers, que só permitem
-- ADMIN informar o par livremente.
ALTER TABLE "Cliente"
  ADD CONSTRAINT "Cliente_vinculo_coerente"
  CHECK ("vendedorId" IS NULL OR "distribuidorId" IS NOT NULL);
