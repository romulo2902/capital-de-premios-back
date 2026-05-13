-- CreateTable
CREATE TABLE "ConfiguracaoComissao" (
    "chave" TEXT NOT NULL DEFAULT 'DEFAULT',
    "percentualDistribuidor" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "percentualVendedor" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoComissao_pkey" PRIMARY KEY ("chave")
);
