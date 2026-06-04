CREATE TYPE "TipoBanner" AS ENUM ('CDP', 'SENA');

CREATE TABLE "Banner" (
  "id" TEXT NOT NULL,
  "tipo" "TipoBanner" NOT NULL,
  "titulo" TEXT,
  "descricao" TEXT,
  "imagemUrl" TEXT NOT NULL,
  "linkUrl" TEXT,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Banner_tipo_ativo_ordem_idx" ON "Banner"("tipo", "ativo", "ordem");
