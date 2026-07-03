ALTER TABLE "EdicaoCombo"
ADD COLUMN IF NOT EXISTS "rangeInicio" BIGINT,
ADD COLUMN IF NOT EXISTS "rangeFinal" BIGINT;

UPDATE "EdicaoCombo" c
SET
  "rangeInicio" = COALESCE(
    (
      SELECT MIN(d."rangeInicio")
      FROM "EdicaoDetalhe" d
      WHERE d."edicaoId" = c."edicaoId"
        AND d."origemParticipacao" = c."origemParticipacao"
        AND d."tipoCartela" = c."tipoCartela"
    ),
    e."rangeInicio"
  ),
  "rangeFinal" = COALESCE(
    (
      SELECT MAX(d."rangeFinal")
      FROM "EdicaoDetalhe" d
      WHERE d."edicaoId" = c."edicaoId"
        AND d."origemParticipacao" = c."origemParticipacao"
        AND d."tipoCartela" = c."tipoCartela"
    ),
    e."rangeFinal"
  )
FROM "Edicao" e
WHERE e."id" = c."edicaoId"
  AND (c."rangeInicio" IS NULL OR c."rangeFinal" IS NULL);

ALTER TABLE "EdicaoCombo"
ALTER COLUMN "rangeInicio" SET NOT NULL,
ALTER COLUMN "rangeFinal" SET NOT NULL;
