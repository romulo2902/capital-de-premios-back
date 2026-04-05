ALTER TABLE "Edicao"
ADD COLUMN "qtdNumerosCartela" INTEGER NOT NULL DEFAULT 15;

ALTER TABLE "Venda"
ADD COLUMN "tipoCartela" "TipoCartela";
