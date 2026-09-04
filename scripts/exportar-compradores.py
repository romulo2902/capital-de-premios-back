#!/usr/bin/env python3
"""
Exporta os compradores (clientes com venda APROVADA em Capital Premios ou
Capital Sena) para CSV e opcionalmente envia para o S3, devolvendo uma URL
temporaria (presigned) para download.

Precisa rodar em um host que alcance o banco: o RDS de producao tem IP
privado, entao NAO funciona a partir de uma maquina fora da VPC.

Uso:
    # so gera o CSV local, sem subir nada
    python3 scripts/exportar-compradores.py --dry-run

    # gera e envia para o S3, imprimindo o link de download
    python3 scripts/exportar-compradores.py

    # recorte por periodo (inclusivo no inicio, exclusivo no fim)
    python3 scripts/exportar-compradores.py --desde 2026-07-01 --ate 2026-08-01

Config lida do ambiente (ou de um .env via --env-file):
    DATABASE_URL           obrigatorio
    AWS_ACCESS_KEY_ID      necessario para o upload
    AWS_SECRET_ACCESS_KEY  necessario para o upload
    AWS_REGION             default us-east-1
    AWS_BUCKET_NAME        necessario para o upload
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

CONSULTA = """
WITH compras AS (
    SELECT "clienteId", total, "createdAt"
    FROM "Venda"
    WHERE status = 'APROVADO'
      AND ("createdAt" >= %(desde)s OR %(desde)s IS NULL)
      AND ("createdAt" <  %(ate)s   OR %(ate)s   IS NULL)
    UNION ALL
    SELECT "clienteId", total, "createdAt"
    FROM "VendaSena"
    WHERE status = 'APROVADO'
      AND ("createdAt" >= %(desde)s OR %(desde)s IS NULL)
      AND ("createdAt" <  %(ate)s   OR %(ate)s   IS NULL)
)
SELECT
    c.nome,
    c.telefone,
    regexp_replace(c.telefone, '[^0-9]', '', 'g') AS telefone_digitos,
    c.cpf,
    COALESCE(c.email, '')                         AS email,
    COUNT(*)                                      AS compras_aprovadas,
    ROUND(SUM(k.total), 2)                        AS total_gasto,
    MAX(k."createdAt")::date                      AS ultima_compra
FROM "Cliente" c
JOIN compras k ON k."clienteId" = c.id
WHERE COALESCE(TRIM(c.nome), '')     <> ''
  AND COALESCE(TRIM(c.telefone), '') <> ''
GROUP BY c.id, c.nome, c.telefone, c.cpf, c.email
ORDER BY c.nome
"""


def carregar_env_file(caminho: Path) -> None:
    """Carrega KEY=VALUE de um .env sem sobrescrever o ambiente existente."""
    if not caminho.is_file():
        sys.exit(f"arquivo de env nao encontrado: {caminho}")

    for linha in caminho.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, valor = linha.split("=", 1)
        chave, valor = chave.strip(), valor.strip().strip('"').strip("'")
        os.environ.setdefault(chave, valor)


def gerar_csv(destino: Path, desde: str | None, ate: str | None) -> int:
    try:
        import psycopg2
    except ImportError:
        sys.exit("psycopg2 ausente. Instale com: pip install psycopg2-binary")

    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL nao definido")

    # connection_limit e parametro do Prisma; o libpq rejeita.
    url = url.replace("&connection_limit=5", "").replace("?connection_limit=5", "")

    with psycopg2.connect(url) as conexao, conexao.cursor() as cursor:
        cursor.execute(CONSULTA, {"desde": desde, "ate": ate})
        colunas = [d[0] for d in cursor.description]
        linhas = cursor.fetchall()

    with destino.open("w", newline="", encoding="utf-8") as arquivo:
        escritor = csv.writer(arquivo)
        escritor.writerow(colunas)
        for linha in linhas:
            escritor.writerow(
                [
                    f"{valor:.2f}" if isinstance(valor, Decimal) else valor
                    for valor in linha
                ]
            )

    return len(linhas)


def enviar_para_s3(origem: Path, expira_em: int) -> str:
    try:
        import boto3
    except ImportError:
        sys.exit("boto3 ausente. Instale com: pip install boto3")

    bucket = os.environ.get("AWS_BUCKET_NAME")
    if not bucket:
        sys.exit("AWS_BUCKET_NAME nao definido")

    cliente = boto3.client(
        "s3",
        region_name=os.environ.get("AWS_REGION", "us-east-1"),
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
    )

    chave = f"relatorios/compradores/{origem.name}"
    # Sem ACL publica de proposito: o arquivo tem CPF e telefone.
    cliente.upload_file(
        str(origem),
        bucket,
        chave,
        ExtraArgs={"ContentType": "text/csv"},
    )

    return cliente.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": chave},
        ExpiresIn=expira_em,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Exporta compradores para CSV e envia ao S3."
    )
    parser.add_argument("--desde", help="data inicial YYYY-MM-DD (inclusiva)")
    parser.add_argument("--ate", help="data final YYYY-MM-DD (exclusiva)")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="gera o CSV local e nao envia para o S3",
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        help="carrega variaveis de um arquivo .env",
    )
    parser.add_argument(
        "--arquivo",
        type=Path,
        help=(
            "envia um CSV que já existe, sem consultar o banco "
            "(nao precisa de DATABASE_URL nem psycopg2)"
        ),
    )
    parser.add_argument(
        "--saida",
        type=Path,
        default=Path("."),
        help="diretorio onde gravar o CSV (default: atual)",
    )
    parser.add_argument(
        "--expira-em",
        type=int,
        default=3600,
        help="validade do link do S3 em segundos (default: 3600)",
    )
    args = parser.parse_args()

    if args.env_file:
        carregar_env_file(args.env_file)

    if args.arquivo:
        destino = args.arquivo
        if not destino.is_file():
            sys.exit(f"arquivo nao encontrado: {destino}")
        linhas = max(
            sum(1 for _ in destino.open(encoding="utf-8", errors="replace")) - 1, 0
        )
        print(f"enviando arquivo existente ({linhas} linhas) -> {destino}")
    else:
        marca = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        destino = args.saida / f"compradores-{marca}.csv"
        args.saida.mkdir(parents=True, exist_ok=True)

        total = gerar_csv(destino, args.desde, args.ate)
        print(f"{total} compradores -> {destino}")

    if args.dry_run:
        print("dry-run: upload para o S3 ignorado")
        return

    url = enviar_para_s3(destino, args.expira_em)
    print(f"\nlink de download (expira em {args.expira_em}s):\n{url}")


if __name__ == "__main__":
    main()
