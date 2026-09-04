#!/usr/bin/env python3
"""
Converte o arquivo bruto da matriz (formato "numero  bola1 bola2 ... bola15
checksum serial") para o CSV que POST /admin/ranges/matriz/upload aceita
(numero;bola1-bola2-...-bola15).

Formato de entrada (um exemplo real, colunas separadas por espacos):
    0000001   03 05 07 10 12 14 16 23 24 28 32 38 39 46 49   96   489937403

As duas ultimas colunas (ex: 96, 489937403) nao tem campo correspondente em
MatrizRange (que so guarda numero + sequenciaBolas) e sao descartadas.

Streaming linha a linha - nao carrega o arquivo inteiro em memoria, entao
funciona nos 380MB / 5 milhoes de linhas do arquivo original sem problema.

Uso:
    python3 scripts/converter-matriz-txt-csv.py entrada.TXT saida.csv

    # ou deixando o nome de saida implicito (troca a extensao para .csv):
    python3 scripts/converter-matriz-txt-csv.py entrada.TXT
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

QTD_BOLAS = 15
PROGRESSO_A_CADA = 500_000


def converter(entrada: Path, saida: Path) -> None:
    total = 0
    escritas = 0
    invalidas = 0

    with entrada.open("r", encoding="utf-8", errors="replace") as f_in, saida.open(
        "w", encoding="utf-8", newline="\n"
    ) as f_out:
        for numero_linha, linha in enumerate(f_in, start=1):
            total += 1
            partes = linha.split()

            if len(partes) < 1 + QTD_BOLAS:
                invalidas += 1
                if invalidas <= 5:
                    print(f"  linha {numero_linha} ignorada (poucos campos): {linha!r}", file=sys.stderr)
                continue

            numero = partes[0]
            bolas = partes[1 : 1 + QTD_BOLAS]

            if not numero.isdigit() or not all(b.isdigit() for b in bolas):
                invalidas += 1
                if invalidas <= 5:
                    print(f"  linha {numero_linha} ignorada (nao numerica): {linha!r}", file=sys.stderr)
                continue

            f_out.write(f"{numero};{'-'.join(bolas)}\n")
            escritas += 1

            if total % PROGRESSO_A_CADA == 0:
                print(f"  {total:,} linhas lidas...", file=sys.stderr)

    print(f"Concluido: {escritas:,} linhas convertidas, {invalidas:,} ignoradas, {total:,} lidas.")
    print(f"Saida: {saida}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("entrada", type=Path, help="Arquivo .TXT bruto da matriz")
    parser.add_argument(
        "saida",
        type=Path,
        nargs="?",
        help="Arquivo .csv de saida (default: mesmo nome da entrada com extensao .csv)",
    )
    args = parser.parse_args()

    if not args.entrada.exists():
        parser.error(f"arquivo de entrada nao encontrado: {args.entrada}")

    saida = args.saida or args.entrada.with_suffix(".csv")
    if saida.exists():
        resposta = input(f"{saida} ja existe. Sobrescrever? [s/N] ").strip().lower()
        if resposta != "s":
            print("Cancelado.")
            sys.exit(1)

    converter(args.entrada, saida)


if __name__ == "__main__":
    main()
