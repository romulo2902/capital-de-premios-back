ALTER TABLE "EdicaoCombo"
ADD COLUMN IF NOT EXISTS "rangeInicio" BIGINT,
ADD COLUMN IF NOT EXISTS "rangeFinal" BIGINT;

UPDATE "EdicaoCombo" c
SET
  "rangeInicio" = COALESCE(r."rangeInicio", e."rangeInicio"),
  "rangeFinal" = COALESCE(r."rangeFinal", e."rangeFinal")
FROM "Edicao" e
LEFT JOIN LATERAL (
  SELECT
    MIN(d."rangeInicio") AS "rangeInicio",
    MAX(d."rangeFinal") AS "rangeFinal"
  FROM "EdicaoDetalhe" d
  WHERE d."edicaoId" = c."edicaoId"
    AND d."origemParticipacao" = c."origemParticipacao"
    AND d."tipoCartela" = c."tipoCartela"
) r ON TRUE
WHERE e."id" = c."edicaoId"
  AND (c."rangeInicio" IS NULL OR c."rangeFinal" IS NULL);

ALTER TABLE "EdicaoCombo"
ALTER COLUMN "rangeInicio" SET NOT NULL,
ALTER COLUMN "rangeFinal" SET NOT NULL;
