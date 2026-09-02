-- Crédito por maquininha.
--
-- O aparelho ganha um limite em reais concedido pelo ADMIN. Venda MANUAL
-- passada nele debita o saldo; cancelar a venda devolve. Cada alteração de
-- saldo nasce de uma linha em `MovimentoCreditoMaquininha`, com o saldo antes
-- e depois congelados — o extrato é reconstituível sem depender do estado
-- atual do aparelho.
--
-- O DEFAULT fica em zero: quem dá teto e crédito ao aparelho novo é o
-- `MaquininhasService.create`, que grava o limite inicial e lança a RECARGA de
-- abertura no mesmo commit. Assim o saldo sempre tem um movimento que o
-- explica, em vez de nascer de um DEFAULT que o extrato não consegue mostrar.
--
-- `limiteCredito = 0` significa NÃO CONFIGURADO e bloqueia a venda MANUAL — é
-- o estado dos aparelhos que já existiam quando esta migration entrar, e eles
-- precisam receber limite antes de operar no MANUAL.

-- CreateEnum
-- O sinal do movimento vem do tipo, nunca do valor: `valor` é sempre positivo.
CREATE TYPE "TipoMovimentoCredito" AS ENUM ('RECARGA', 'CONSUMO', 'ESTORNO', 'AJUSTE_CREDITO', 'AJUSTE_DEBITO');

-- AlterTable
-- DEFAULT não volátil não reescreve a tabela (PG 11+), então o ACCESS
-- EXCLUSIVE dura o tempo de mexer no catálogo, não de varrer as linhas.
ALTER TABLE "Maquininha" ADD COLUMN     "limiteCredito" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "saldoCredito" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MovimentoCreditoMaquininha" (
    "id" TEXT NOT NULL,
    "maquininhaId" TEXT NOT NULL,
    "tipo" "TipoMovimentoCredito" NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "saldoAnterior" DECIMAL(12,2) NOT NULL,
    "saldoPosterior" DECIMAL(12,2) NOT NULL,
    "vendaId" TEXT,
    "vendaSenaId" TEXT,
    "criadoPorId" TEXT,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentoCreditoMaquininha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Extrato do aparelho, que é sempre "movimentos desta maquininha, mais
-- recentes primeiro". Pelo prefixo também cobre o filtro só por maquininhaId.
CREATE INDEX "MovimentoCreditoMaquininha_maquininhaId_createdAt_idx" ON "MovimentoCreditoMaquininha"("maquininhaId", "createdAt");

-- CreateIndex
-- Relatório consolidado por tipo e período (quanto foi recarregado, consumido
-- e estornado no mês) sem varrer a tabela inteira.
CREATE INDEX "MovimentoCreditoMaquininha_tipo_createdAt_idx" ON "MovimentoCreditoMaquininha"("tipo", "createdAt");

-- CreateIndex
--
-- Estes dois índices são a garantia ESTRUTURAL contra débito ou estorno
-- duplicado: uma venda não consegue gerar dois CONSUMO nem dois ESTORNO, e a
-- recusa vem do banco, não da ordem em que o código roda. Cobre retry de
-- request, cancelamento chamado duas vezes e corrida entre dois operadores.
--
-- No Postgres NULL não conflita com NULL, então as linhas de RECARGA e
-- AJUSTE — que não têm venda vinculada — passam livres.
CREATE UNIQUE INDEX "MovimentoCreditoMaquininha_vendaId_tipo_key" ON "MovimentoCreditoMaquininha"("vendaId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "MovimentoCreditoMaquininha_vendaSenaId_tipo_key" ON "MovimentoCreditoMaquininha"("vendaSenaId", "tipo");

-- AddForeignKey
-- RESTRICT na maquininha: aparelho com histórico de crédito não some do banco.
-- Tabela nova e vazia, então validar agora não custa varredura.
ALTER TABLE "MovimentoCreditoMaquininha" ADD CONSTRAINT "MovimentoCreditoMaquininha_maquininhaId_fkey" FOREIGN KEY ("maquininhaId") REFERENCES "Maquininha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoCreditoMaquininha" ADD CONSTRAINT "MovimentoCreditoMaquininha_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoCreditoMaquininha" ADD CONSTRAINT "MovimentoCreditoMaquininha_vendaSenaId_fkey" FOREIGN KEY ("vendaSenaId") REFERENCES "VendaSena"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoCreditoMaquininha" ADD CONSTRAINT "MovimentoCreditoMaquininha_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill dos aparelhos que já estavam cadastrados.
--
-- Sem isto, todo aparelho existente ficaria com limite e saldo zero — e, pela
-- regra de que aparelho sem limite não vende no MANUAL, a frota inteira pararia
-- no instante do deploy. Recuperar exigiria dois passos manuais por aparelho
-- (conceder limite e recarregar), porque só o limite não basta: com saldo zero
-- a venda ainda cai em "crédito insuficiente".
--
-- Recebem o mesmo tratamento do cadastro novo: teto no máximo (R$ 5.000) e
-- saldo de abertura (R$ 2.000). Inclui os INATIVA de propósito — deixá-los em
-- zero criaria uma armadilha silenciosa para quem reativasse depois.
UPDATE "Maquininha" SET "limiteCredito" = 5000, "saldoCredito" = 2000;

-- O crédito acima precisa de um movimento que o explique: `saldoCredito` é a
-- materialização do razão, e saldo sem lançamento por trás quebraria a
-- identidade `saldo = soma dos movimentos` logo na primeira leitura do extrato.
--
-- `criadoPorId` fica nulo porque não houve operador: quem concedeu foi a
-- migração, e é o `motivo` que conta essa história no extrato.
--
-- `gen_random_uuid()` é nativa a partir do PostgreSQL 13 (aqui roda em 16); em
-- versão anterior seria preciso `CREATE EXTENSION pgcrypto` antes.
INSERT INTO "MovimentoCreditoMaquininha" (
    "id",
    "maquininhaId",
    "tipo",
    "valor",
    "saldoAnterior",
    "saldoPosterior",
    "motivo"
)
SELECT
    gen_random_uuid()::text,
    "id",
    'RECARGA',
    2000,
    0,
    2000,
    'Crédito de abertura concedido na migração do controle de crédito'
FROM "Maquininha";
