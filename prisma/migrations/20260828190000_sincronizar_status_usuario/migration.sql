-- Fecha o acesso de vendedor/distribuidor inativado.
--
-- `Vendedor.status` e `Distribuidor.status` eram gravados sem tocar em
-- `Usuario.status`. Como o login do painel (`POST /auth/login`) e o
-- `JwtStrategy` validam `Usuario.status`, quem foi inativado continuava
-- autenticando e recebendo token — só o canal POS bloqueava, porque ele checa
-- o status do próprio vendedor.
--
-- O código passou a propagar o status nas duas escritas (inativação e update),
-- mas isso só vale para operações novas: as linhas já inconsistentes precisam
-- deste backfill.
--
-- Só fecha acesso, nunca reabre: reativar um cadastro continua sendo ação
-- explícita pelo PATCH.

UPDATE "Usuario" u
SET status = 'INATIVO'
FROM "Vendedor" v
WHERE v."usuarioId" = u.id
  AND v.status = 'INATIVO'
  AND u.status = 'ATIVO';

UPDATE "Usuario" u
SET status = 'INATIVO'
FROM "Distribuidor" d
WHERE d."usuarioId" = u.id
  AND d.status = 'INATIVO'
  AND u.status = 'ATIVO';
