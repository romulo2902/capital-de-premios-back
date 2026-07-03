-- CreateEnum
CREATE TYPE "StatusEdicaoSena" AS ENUM ('RASCUNHO', 'ATIVA', 'ENCERRADA', 'APURANDO', 'FINALIZADA');

-- CreateEnum
CREATE TYPE "StatusCartelaSena" AS ENUM ('PENDENTE_PAGAMENTO', 'CONFIRMADA', 'NAO_PREMIADA', 'QUADRA', 'QUINA', 'SENA', 'SENA_BONUS');

-- CreateEnum
CREATE TYPE "StatusVendaSena" AS ENUM ('PENDENTE', 'APROVADO', 'RECUSADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ModoSelecaoSena" AS ENUM ('MANUAL', 'SURPRESINHA');

-- CreateEnum
CREATE TYPE "FaixaPremiacao" AS ENUM ('QUADRA', 'QUINA', 'SENA', 'SENA_BONUS');

-- CreateTable
CREATE TABLE "EdicaoSena" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "descricao" TEXT,
    "dataSorteioMegaSena" TIMESTAMP(3) NOT NULL,
    "dataEncerramento" TIMESTAMP(3) NOT NULL,
    "valorCartela" DECIMAL(65,30) NOT NULL,
    "imagemUrl" TEXT,
    "status" "StatusEdicaoSena" NOT NULL DEFAULT 'RASCUNHO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EdicaoSena_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComboSena" (
    "id" TEXT NOT NULL,
    "edicaoSenaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "preco" DECIMAL(65,30) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComboSena_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PremioSena" (
    "id" TEXT NOT NULL,
    "edicaoSenaId" TEXT NOT NULL,
    "faixa" "FaixaPremiacao" NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(65,30) NOT NULL,
    "imagemUrl" TEXT,

    CONSTRAINT "PremioSena_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendaSena" (
    "id" TEXT NOT NULL,
    "edicaoSenaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "vendedorId" TEXT,
    "distribuidorId" TEXT,
    "comboSenaId" TEXT,
    "quantidade" INTEGER NOT NULL,
    "total" DECIMAL(65,30) NOT NULL,
    "status" "StatusVendaSena" NOT NULL DEFAULT 'PENDENTE',
    "tipoPagamento" "TipoPagamento" NOT NULL,
    "gatewayId" TEXT,
    "gatewayPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendaSena_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartelaSena" (
    "id" TEXT NOT NULL,
    "vendaSenaId" TEXT NOT NULL,
    "edicaoSenaId" TEXT NOT NULL,
    "numerosEscolhidos" INTEGER[],
    "setimoNumero" INTEGER,
    "modoSelecao" "ModoSelecaoSena" NOT NULL,
    "acertos" INTEGER,
    "setimoAcertou" BOOLEAN,
    "status" "StatusCartelaSena" NOT NULL DEFAULT 'PENDENTE_PAGAMENTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartelaSena_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultadoSena" (
    "id" TEXT NOT NULL,
    "edicaoSenaId" TEXT NOT NULL,
    "numerosSorteados" INTEGER[],
    "imagemResultadoUrl" TEXT,
    "apurado" BOOLEAN NOT NULL DEFAULT false,
    "apuradoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResultadoSena_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComissaoSena" (
    "id" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "vendaSenaId" TEXT NOT NULL,
    "valor" DECIMAL(65,30) NOT NULL,
    "status" "StatusComissao" NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComissaoSena_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComissaoDistribuidorSena" (
    "id" TEXT NOT NULL,
    "distribuidorId" TEXT NOT NULL,
    "vendaSenaId" TEXT NOT NULL,
    "valor" DECIMAL(65,30) NOT NULL,
    "status" "StatusComissao" NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComissaoDistribuidorSena_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EdicaoSena_numero_key" ON "EdicaoSena"("numero");

-- CreateIndex
CREATE INDEX "EdicaoSena_status_idx" ON "EdicaoSena"("status");

-- CreateIndex
CREATE INDEX "ComboSena_edicaoSenaId_idx" ON "ComboSena"("edicaoSenaId");

-- CreateIndex
CREATE INDEX "PremioSena_edicaoSenaId_idx" ON "PremioSena"("edicaoSenaId");

-- CreateIndex
CREATE UNIQUE INDEX "PremioSena_edicaoSenaId_faixa_key" ON "PremioSena"("edicaoSenaId", "faixa");

-- CreateIndex
CREATE INDEX "VendaSena_edicaoSenaId_idx" ON "VendaSena"("edicaoSenaId");

-- CreateIndex
CREATE INDEX "VendaSena_clienteId_idx" ON "VendaSena"("clienteId");

-- CreateIndex
CREATE INDEX "CartelaSena_edicaoSenaId_idx" ON "CartelaSena"("edicaoSenaId");

-- CreateIndex
CREATE INDEX "CartelaSena_vendaSenaId_idx" ON "CartelaSena"("vendaSenaId");

-- CreateIndex
CREATE INDEX "CartelaSena_status_idx" ON "CartelaSena"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ResultadoSena_edicaoSenaId_key" ON "ResultadoSena"("edicaoSenaId");

-- CreateIndex
CREATE UNIQUE INDEX "ComissaoSena_vendaSenaId_key" ON "ComissaoSena"("vendaSenaId");

-- CreateIndex
CREATE UNIQUE INDEX "ComissaoDistribuidorSena_vendaSenaId_key" ON "ComissaoDistribuidorSena"("vendaSenaId");

-- AddForeignKey
ALTER TABLE "ComboSena" ADD CONSTRAINT "ComboSena_edicaoSenaId_fkey" FOREIGN KEY ("edicaoSenaId") REFERENCES "EdicaoSena"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremioSena" ADD CONSTRAINT "PremioSena_edicaoSenaId_fkey" FOREIGN KEY ("edicaoSenaId") REFERENCES "EdicaoSena"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendaSena" ADD CONSTRAINT "VendaSena_edicaoSenaId_fkey" FOREIGN KEY ("edicaoSenaId") REFERENCES "EdicaoSena"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendaSena" ADD CONSTRAINT "VendaSena_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendaSena" ADD CONSTRAINT "VendaSena_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartelaSena" ADD CONSTRAINT "CartelaSena_vendaSenaId_fkey" FOREIGN KEY ("vendaSenaId") REFERENCES "VendaSena"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartelaSena" ADD CONSTRAINT "CartelaSena_edicaoSenaId_fkey" FOREIGN KEY ("edicaoSenaId") REFERENCES "EdicaoSena"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultadoSena" ADD CONSTRAINT "ResultadoSena_edicaoSenaId_fkey" FOREIGN KEY ("edicaoSenaId") REFERENCES "EdicaoSena"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComissaoSena" ADD CONSTRAINT "ComissaoSena_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComissaoSena" ADD CONSTRAINT "ComissaoSena_vendaSenaId_fkey" FOREIGN KEY ("vendaSenaId") REFERENCES "VendaSena"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComissaoDistribuidorSena" ADD CONSTRAINT "ComissaoDistribuidorSena_distribuidorId_fkey" FOREIGN KEY ("distribuidorId") REFERENCES "Distribuidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComissaoDistribuidorSena" ADD CONSTRAINT "ComissaoDistribuidorSena_vendaSenaId_fkey" FOREIGN KEY ("vendaSenaId") REFERENCES "VendaSena"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
