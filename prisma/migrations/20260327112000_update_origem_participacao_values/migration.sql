-- RenameEnumValue
ALTER TYPE "OrigemParticipacao" RENAME VALUE 'FISICA' TO 'FISICO';

-- AlterEnum
ALTER TYPE "OrigemParticipacao" ADD VALUE IF NOT EXISTS 'POS';
