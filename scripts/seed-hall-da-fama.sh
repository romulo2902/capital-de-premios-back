#!/usr/bin/env bash
#
# Popula dados fake para as secoes "Sorteios Anteriores" e "Hall da Fama" da
# loja: 4 edicoes FINALIZADA com imagem e 4 ganhadores.
#
# Precisa rodar em um host que alcance o banco: o RDS tem IP privado, entao NAO
# funciona a partir de uma maquina fora da VPC — rode na VPS.
#
# Uso (dentro da pasta do projeto):
#     ./scripts/seed-hall-da-fama.sh              # insere
#     ./scripts/seed-hall-da-fama.sh --limpar     # remove tudo que inseriu
#     ./scripts/seed-hall-da-fama.sh --env-file .env.homolog
#
# Le DATABASE_URL do .env da pasta (ou do --env-file). Usa o psql do host se
# existir; senao, sobe um container descartavel so com o cliente psql.
#
# Todos os registros usam UUID comecando em 5eed e edicoes SEED-HML-*, entao a
# limpeza e inequivoca. O SQL e transacional: ou entra tudo, ou nada.

set -euo pipefail

ENV_FILE=".env"
MODO="seed"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --limpar|--clean) MODO="limpar"; shift ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Argumento desconhecido: $1" >&2; exit 1 ;;
  esac
done

cd "$(dirname "$0")/.."

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERRO: $ENV_FILE nao encontrado em $(pwd)" >&2
  exit 1
fi

# Le so a DATABASE_URL, sem exportar o resto do .env para o ambiente.
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')"

if [[ -z "$DATABASE_URL" ]]; then
  echo "ERRO: DATABASE_URL nao encontrada em $ENV_FILE" >&2
  exit 1
fi

# Mostra o destino sem vazar a senha.
DESTINO="$(printf '%s' "$DATABASE_URL" | sed -E 's#//[^:]+:[^@]*@#//***:***@#')"
echo "Banco: $DESTINO"
echo "Modo:  $MODO"
echo

if command -v psql >/dev/null 2>&1; then
  rodar_sql() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f - ; }
  echo "Usando psql do host."
elif command -v docker >/dev/null 2>&1; then
  # Dentro do container, "localhost" e o proprio container — nao o host. Mesma
  # reescrita que docker/entrypoint.sh faz via DOCKER_DATABASE_HOST.
  URL_CONTAINER="$(printf '%s' "$DATABASE_URL" \
    | sed -E 's#@(localhost|127\.0\.0\.1):#@host.docker.internal:#')"
  rodar_sql() {
    docker run --rm -i \
      --add-host=host.docker.internal:host-gateway \
      -e PGURL="$URL_CONTAINER" postgres:16-alpine \
      sh -c 'psql "$PGURL" -v ON_ERROR_STOP=1 -q -f -'
  }
  echo "psql nao encontrado no host; usando container descartavel postgres:16-alpine."
else
  echo "ERRO: precisa de psql ou docker instalado." >&2
  exit 1
fi

echo

if [[ "$MODO" == "limpar" ]]; then
  rodar_sql <<'SQL'
BEGIN;
DELETE FROM "Bilhete" WHERE id::text LIKE '5eed0005%';
DELETE FROM "Venda"   WHERE id::text LIKE '5eed0004%';
DELETE FROM "Premio"  WHERE id::text LIKE '5eed0002%';
DELETE FROM "Cliente" WHERE id::text LIKE '5eed0003%';
DELETE FROM "Edicao"  WHERE numero LIKE 'SEED-HML-%';
COMMIT;
SQL
  echo "Dados do seed removidos."
  exit 0
fi

rodar_sql <<'SQL'
BEGIN;

-- Aborta cedo se nao houver matriz para os bilhetes.
DO $$
BEGIN
  IF (SELECT count(*) FROM "MatrizRange") < 4 THEN
    RAISE EXCEPTION 'MatrizRange tem menos de 4 linhas — importe a matriz antes de rodar este seed';
  END IF;
END $$;

-- Evita duplicar se rodarem duas vezes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Edicao" WHERE numero LIKE 'SEED-HML-%') THEN
    RAISE EXCEPTION 'Seed ja aplicado. Rode com --limpar antes de reaplicar.';
  END IF;
END $$;

-- ─── Edicoes finalizadas (alimentam "Sorteios Anteriores") ───────────────────
INSERT INTO "Edicao"
  (id, numero, "dataSorteio", "dataEncerramento", "valorCartela",
   "qtdNumerosCartela", "rangeInicio", "rangeFinal", "qtdPremios",
   destino, raspadinha, frase, "imagemUrl", "manutencaoAtiva", status, "createdAt")
VALUES
  ('5eed0001-0000-4000-8000-000000000001', 'SEED-HML-01',
   now() - interval '7 days',  now() - interval '7 days',  10.00, 6, 9100000, 9100999, 3,
   'SITE', false, 'Jeep Renegade',    'https://picsum.photos/seed/cdp1/900/500', false, 'FINALIZADA', now()),
  ('5eed0001-0000-4000-8000-000000000002', 'SEED-HML-02',
   now() - interval '21 days', now() - interval '21 days', 10.00, 6, 9101000, 9101999, 3,
   'SITE', false, 'Nissan Kicks',     'https://picsum.photos/seed/cdp2/900/500', false, 'FINALIZADA', now()),
  ('5eed0001-0000-4000-8000-000000000003', 'SEED-HML-03',
   now() - interval '35 days', now() - interval '35 days', 10.00, 6, 9102000, 9102999, 3,
   'SITE', false, 'BYD Dolphin Mini', 'https://picsum.photos/seed/cdp3/900/500', false, 'FINALIZADA', now()),
  ('5eed0001-0000-4000-8000-000000000004', 'SEED-HML-04',
   now() - interval '49 days', now() - interval '49 days', 10.00, 6, 9103000, 9103999, 3,
   'SITE', false, 'Renault Kwid',     'https://picsum.photos/seed/cdp4/900/500', false, 'FINALIZADA', now());

-- ─── Premios da edicao mais recente (alimentam o Hall da Fama) ───────────────
INSERT INTO "Premio" (id, "edicaoId", ordem, descricao, valor, "imagemUrl")
VALUES
  ('5eed0002-0000-4000-8000-000000000001', '5eed0001-0000-4000-8000-000000000001', 1, '1o Premio - Jeep Renegade', 3000, NULL),
  ('5eed0002-0000-4000-8000-000000000002', '5eed0001-0000-4000-8000-000000000001', 2, '2o Premio - R$ 5.000,00',   5000, NULL),
  -- Dividido entre 2 ganhadores -> a landing mostra "(/2)"
  ('5eed0002-0000-4000-8000-000000000003', '5eed0001-0000-4000-8000-000000000001', 3, '3o Premio - R$ 7.000,00',   7000, NULL);

-- ─── Clientes fake ──────────────────────────────────────────────────────────
-- updatedAt e obrigatorio e NAO tem default no banco: em SQL cru precisa ir
-- explicito (o Prisma preenche sozinho, o INSERT direto nao).
INSERT INTO "Cliente" (id, cpf, nome, telefone, cidade, estado, email, status, "createdAt", "updatedAt")
VALUES
  ('5eed0003-0000-4000-8000-000000000001', '99900000001', 'Maria Silva Oliveira', '61999000001', 'Ceilandia',    'DF', NULL, 'ATIVO', now(), now()),
  ('5eed0003-0000-4000-8000-000000000002', '99900000002', 'Joao Pereira',         '61999000002', 'Valparaiso',   'GO', NULL, 'ATIVO', now(), now()),
  ('5eed0003-0000-4000-8000-000000000003', '99900000003', 'Ana Lima Costa',       '61999000003', 'Aguas Lindas', 'GO', NULL, 'ATIVO', now(), now()),
  -- Sem cidade/UF e em minusculas de proposito: exercita a omissao da linha de
  -- local e a normalizacao do nome para caixa alta.
  ('5eed0003-0000-4000-8000-000000000004', '99900000004', 'carlos eduardo',       '61999000004', NULL, NULL,     NULL, 'ATIVO', now(), now());

-- ─── Vendas aprovadas ───────────────────────────────────────────────────────
-- Reaproveita um vendedor existente (vira o "Pe Quente"). Se nao houver nenhum,
-- fica NULL e a pill some do card — que tambem e um caso valido.
INSERT INTO "Venda"
  (id, "edicaoId", "clienteId", "vendedorId", quantidade, total, status,
   "origemParticipacao", "tipoPagamento", "createdAt")
VALUES
  ('5eed0004-0000-4000-8000-000000000001', '5eed0001-0000-4000-8000-000000000001',
   '5eed0003-0000-4000-8000-000000000001',
   (SELECT id FROM "Vendedor" ORDER BY codigo LIMIT 1), 1, 10.00, 'APROVADO', 'DIGITAL', 'PIX', now()),
  -- Sem vendedor de proposito
  ('5eed0004-0000-4000-8000-000000000002', '5eed0001-0000-4000-8000-000000000001',
   '5eed0003-0000-4000-8000-000000000002',
   NULL, 1, 10.00, 'APROVADO', 'DIGITAL', 'PIX', now()),
  ('5eed0004-0000-4000-8000-000000000003', '5eed0001-0000-4000-8000-000000000001',
   '5eed0003-0000-4000-8000-000000000003',
   (SELECT id FROM "Vendedor" ORDER BY codigo LIMIT 1), 1, 10.00, 'APROVADO', 'DIGITAL', 'PIX', now()),
  ('5eed0004-0000-4000-8000-000000000004', '5eed0001-0000-4000-8000-000000000001',
   '5eed0003-0000-4000-8000-000000000004',
   (SELECT id FROM "Vendedor" ORDER BY codigo LIMIT 1), 1, 10.00, 'APROVADO', 'DIGITAL', 'PIX', now());

-- ─── Bilhetes ganhadores ────────────────────────────────────────────────────
-- Reaproveita matrizes existentes: a unicidade e por [matrizId, edicaoId] e a
-- edicao e nova, entao nao ha como colidir com bilhete real.
WITH matrizes AS (
  SELECT id, numero, row_number() OVER (ORDER BY numero) AS rn
  FROM (SELECT id, numero FROM "MatrizRange" ORDER BY numero LIMIT 4) t
),
dados (rn, bilhete_id, venda_id, premio_id) AS (
  VALUES
    (1::bigint, '5eed0005-0000-4000-8000-000000000001'::uuid,
                '5eed0004-0000-4000-8000-000000000001'::uuid,
                '5eed0002-0000-4000-8000-000000000001'::uuid),
    (2::bigint, '5eed0005-0000-4000-8000-000000000002'::uuid,
                '5eed0004-0000-4000-8000-000000000002'::uuid,
                '5eed0002-0000-4000-8000-000000000002'::uuid),
    -- Os dois abaixo ganham o MESMO premio -> rateio "(/2)"
    (3::bigint, '5eed0005-0000-4000-8000-000000000003'::uuid,
                '5eed0004-0000-4000-8000-000000000003'::uuid,
                '5eed0002-0000-4000-8000-000000000003'::uuid),
    (4::bigint, '5eed0005-0000-4000-8000-000000000004'::uuid,
                '5eed0004-0000-4000-8000-000000000004'::uuid,
                '5eed0002-0000-4000-8000-000000000003'::uuid)
)
INSERT INTO "Bilhete"
  (id, "vendaId", "edicaoId", "matrizId", numero, "sequenciaBolas", ganhador, "premioId")
SELECT d.bilhete_id,
       d.venda_id,
       '5eed0001-0000-4000-8000-000000000001',
       m.id,
       m.numero,
       '{1,2,3,4,5,6}',
       true,
       d.premio_id
FROM dados d
JOIN matrizes m ON m.rn = d.rn;

COMMIT;
SQL

echo "Seed aplicado."
echo
echo "Conferir:"
echo "  curl -s http://127.0.0.1:\${PORT:-3000}/api/loja/ganhadores"
echo "  curl -s http://127.0.0.1:\${PORT:-3000}/api/loja/resultados"
echo
echo "O Hall tem cache de 5 min. Para ver na hora: docker compose restart api"
