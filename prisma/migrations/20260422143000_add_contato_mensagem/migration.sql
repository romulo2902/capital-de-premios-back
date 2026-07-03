-- CreateTable
CREATE TABLE "ContatoMensagem" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContatoMensagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContatoMensagem_createdAt_idx" ON "ContatoMensagem"("createdAt");

-- CreateIndex
CREATE INDEX "ContatoMensagem_cpf_createdAt_idx" ON "ContatoMensagem"("cpf", "createdAt");

-- CreateIndex
CREATE INDEX "ContatoMensagem_fingerprint_createdAt_idx" ON "ContatoMensagem"("fingerprint", "createdAt");
