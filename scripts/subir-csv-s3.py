#!/usr/bin/env python3
"""Sobe um arquivo para o S3 e imprime um link temporario de download.

Uso:
    pip3 install boto3
    python3 subir-csv-s3.py compradores.csv --env-file .env

Le do ambiente (ou do --env-file):
    AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_BUCKET_NAME, AWS_REGION
"""

import argparse
import os
import sys
from pathlib import Path

import boto3


def carregar_env(caminho):
    for linha in Path(caminho).read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            chave, valor = linha.split("=", 1)
            os.environ.setdefault(chave.strip(), valor.strip().strip('"').strip("'"))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("arquivo")
    p.add_argument("--env-file")
    p.add_argument("--prefixo", default="relatorios/compradores")
    p.add_argument("--expira-em", type=int, default=3600)
    a = p.parse_args()

    if a.env_file:
        carregar_env(a.env_file)

    origem = Path(a.arquivo)
    if not origem.is_file():
        sys.exit(f"arquivo nao encontrado: {origem}")

    bucket = os.environ.get("AWS_BUCKET_NAME") or os.environ.get("AWS_BUCKET")
    if not bucket:
        sys.exit("defina AWS_BUCKET_NAME")

    s3 = boto3.client(
        "s3",
        region_name=os.environ.get("AWS_REGION", "us-east-1"),
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
    )

    chave = f"{a.prefixo.strip('/')}/{origem.name}"
    # sem ACL publica de proposito: o arquivo tem CPF e telefone
    s3.upload_file(str(origem), bucket, chave, ExtraArgs={"ContentType": "text/csv"})
    print(f"enviado: s3://{bucket}/{chave}")

    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": chave},
        ExpiresIn=a.expira_em,
    )
    print(f"\nlink (expira em {a.expira_em}s):\n{url}")


if __name__ == "__main__":
    main()
