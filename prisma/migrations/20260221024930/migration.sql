-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR', 'CLIENTE');

-- CreateEnum
CREATE TYPE "StatusUsuario" AS ENUM ('ATIVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "StatusEdicao" AS ENUM ('RASCUNHO', 'ATIVA', 'ENCERRADA', 'SORTEANDO', 'FINALIZADA');

-- CreateEnum
CREATE TYPE "StatusVenda" AS ENUM ('PENDENTE', 'APROVADO', 'RECUSADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoPagamento" AS ENUM ('PIX', 'CARTAO');

-- CreateEnum
CREATE TYPE "StatusSaque" AS ENUM ('SOLICITADO', 'APROVADO', 'PAGO', 'RECUSADO');

-- CreateEnum
CREATE TYPE "TipoSaque" AS ENUM ('VENDEDOR', 'DISTRIBUIDOR');

-- CreateEnum
CREATE TYPE "StatusComissao" AS ENUM ('PENDENTE', 'PAGO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "cpf" TEXT,
    "email" TEXT,
    "senhaHash" TEXT,
    "perfil" "Perfil" NOT NULL,
    "status" "StatusUsuario" NOT NULL DEFAULT 'ATIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Distribuidor" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "link" TEXT,
    "qrcode" TEXT,
    "status" "StatusUsuario" NOT NULL DEFAULT 'ATIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Distribuidor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendedor" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "distribuidorId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "comissaoPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "telefone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "link" TEXT,
    "qrcode" TEXT,
    "status" "StatusUsuario" NOT NULL DEFAULT 'ATIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "email" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "status" "StatusUsuario" NOT NULL DEFAULT 'ATIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Edicao" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "dataSorteio" TIMESTAMP(3) NOT NULL,
    "dataEncerramento" TIMESTAMP(3) NOT NULL,
    "valorCartela" DECIMAL(65,30) NOT NULL,
    "rangeInicio" BIGINT NOT NULL,
    "rangeFinal" BIGINT NOT NULL,
    "qtdPremios" INTEGER NOT NULL,
    "especie" TEXT NOT NULL,
    "imagemUrl" TEXT,
    "status" "StatusEdicao" NOT NULL DEFAULT 'RASCUNHO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Edicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Premio" (
    "id" TEXT NOT NULL,
    "edicaoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(65,30) NOT NULL,
    "ganhadorBilheteId" TEXT,

    CONSTRAINT "Premio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Range" (
    "id" TEXT NOT NULL,
    "numero" BIGINT NOT NULL,
    "sequenciaBolas" INTEGER[],
    "disponivel" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Range_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venda" (
    "id" TEXT NOT NULL,
    "edicaoId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "vendedorId" TEXT,
    "distribuidorId" TEXT,
    "quantidade" INTEGER NOT NULL,
    "total" DECIMAL(65,30) NOT NULL,
    "status" "StatusVenda" NOT NULL DEFAULT 'PENDENTE',
    "tipoPagamento" "TipoPagamento" NOT NULL,
    "gatewayId" TEXT,
    "gatewayPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bilhete" (
    "id" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "rangeId" TEXT NOT NULL,
    "numero" BIGINT NOT NULL,
    "sequenciaBolas" INTEGER[],
    "ganhador" BOOLEAN NOT NULL DEFAULT false,
    "premioId" TEXT,

    CONSTRAINT "Bilhete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resultado" (
    "id" TEXT NOT NULL,
    "edicaoId" TEXT NOT NULL,
    "numerosApurados" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resultado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comissao" (
    "id" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "valor" DECIMAL(65,30) NOT NULL,
    "status" "StatusComissao" NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Saque" (
    "id" TEXT NOT NULL,
    "tipo" "TipoSaque" NOT NULL,
    "vendedorId" TEXT,
    "distribuidorId" TEXT,
    "valor" DECIMAL(65,30) NOT NULL,
    "status" "StatusSaque" NOT NULL DEFAULT 'SOLICITADO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Saque_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_cpf_key" ON "Usuario"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Distribuidor_usuarioId_key" ON "Distribuidor"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Distribuidor_cpf_key" ON "Distribuidor"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Vendedor_usuarioId_key" ON "Vendedor"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendedor_codigo_key" ON "Vendedor"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_cpf_key" ON "Cliente"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Edicao_numero_key" ON "Edicao"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Range_numero_key" ON "Range"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Resultado_edicaoId_key" ON "Resultado"("edicaoId");

-- CreateIndex
CREATE UNIQUE INDEX "Comissao_vendaId_key" ON "Comissao"("vendaId");

-- AddForeignKey
ALTER TABLE "Vendedor" ADD CONSTRAINT "Vendedor_distribuidorId_fkey" FOREIGN KEY ("distribuidorId") REFERENCES "Distribuidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Premio" ADD CONSTRAINT "Premio_edicaoId_fkey" FOREIGN KEY ("edicaoId") REFERENCES "Edicao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_edicaoId_fkey" FOREIGN KEY ("edicaoId") REFERENCES "Edicao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bilhete" ADD CONSTRAINT "Bilhete_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bilhete" ADD CONSTRAINT "Bilhete_rangeId_fkey" FOREIGN KEY ("rangeId") REFERENCES "Range"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resultado" ADD CONSTRAINT "Resultado_edicaoId_fkey" FOREIGN KEY ("edicaoId") REFERENCES "Edicao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comissao" ADD CONSTRAINT "Comissao_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comissao" ADD CONSTRAINT "Comissao_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Saque" ADD CONSTRAINT "Saque_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Saque" ADD CONSTRAINT "Saque_distribuidorId_fkey" FOREIGN KEY ("distribuidorId") REFERENCES "Distribuidor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
