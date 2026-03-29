import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

export function aplicarFiltroPeriodoCadastro(
  where: Record<string, unknown>,
  dataInicio?: string,
  dataFim?: string,
): void {
  if (!dataInicio && !dataFim) {
    return;
  }

  where.createdAt = {};

  if (dataInicio) {
    (where.createdAt as Record<string, unknown>).gte = parseDataRelatorio(
      dataInicio,
      'inicio',
    );
  }

  if (dataFim) {
    (where.createdAt as Record<string, unknown>).lte = parseDataRelatorio(
      dataFim,
      'fim',
    );
  }
}

export function parseDataRelatorio(
  value: string,
  boundary: 'inicio' | 'fim',
): Date {
  const rawValue = value.trim();
  const isoDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawValue);
  if (isoDateMatch) {
    const year = Number(isoDateMatch[1]);
    const month = Number(isoDateMatch[2]);
    const day = Number(isoDateMatch[3]);

    return buildCalendarDate(year, month, day, boundary);
  }

  if (!/^\d{4}-\d{2}-\d{2}T/.test(rawValue)) {
    throw new BadRequestException(
      'Data de filtro inválida. Use ISO, preferencialmente YYYY-MM-DD',
    );
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(
      'Data de filtro inválida. Use ISO, preferencialmente YYYY-MM-DD',
    );
  }

  return parsed;
}

export function formatarPercentual(value: number): string {
  const percentual = Number.isInteger(value)
    ? value.toString()
    : value.toFixed(2);
  return `${percentual}%`;
}

export function formatarCpf(cpf: string): string {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

export function formatarCodigo(codigo: number): string {
  return String(codigo).padStart(4, '0');
}

export function formatarData(data?: Date | null): string {
  return data ? data.toLocaleDateString('pt-BR') : '';
}

export function formatarDataHora(data: Date): string {
  return data.toLocaleString('pt-BR');
}

export function valorPlanilha(
  value: string | number | null | undefined,
): string | number {
  return value ?? '';
}

export function valorPlanilhaTexto(
  value: string | number | null | undefined,
): string {
  return value === null || value === undefined ? '' : String(value);
}

export function formatarNumeroAleatorio(
  value: bigint | number | string | null | undefined,
): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).padStart(5, '0');
}

export function aplicarFormatoTextoColunas(
  sheet: ExcelJS.Worksheet,
  keys: string[],
): void {
  for (const key of keys) {
    const column = sheet.getColumn(key);
    column.numFmt = '@';
  }
}

export function resolverNumeroAleatorioCliente(
  vendas: Array<{
    bilhetes: Array<{
      numero: bigint;
    }>;
  }>,
): string {
  const numero = vendas[0]?.bilhetes[0]?.numero;
  return formatarNumeroAleatorio(numero);
}

function buildCalendarDate(
  year: number,
  month: number,
  day: number,
  boundary: 'inicio' | 'fim',
): Date {
  const date = new Date(
    year,
    month - 1,
    day,
    boundary === 'inicio' ? 0 : 23,
    boundary === 'inicio' ? 0 : 59,
    boundary === 'inicio' ? 0 : 59,
    boundary === 'inicio' ? 0 : 999,
  );

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new BadRequestException(
      'Data de filtro inválida. Use ISO, preferencialmente YYYY-MM-DD',
    );
  }

  return date;
}
