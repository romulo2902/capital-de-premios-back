-- AlterTable
ALTER TABLE "EdicaoDetalhe" ADD COLUMN     "preco" DECIMAL(65,30);

-- CreateTable
CREATE TABLE "PaginaConteudo" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaginaConteudo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaginaConteudo_slug_key" ON "PaginaConteudo"("slug");
