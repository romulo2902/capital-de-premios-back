import * as ExcelJS from 'exceljs';
import { Perfil } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ContagemImportacao, TipoPlanilha } from './migracao.types';

export function identificarTipoPlanilha(
  worksheet: ExcelJS.Worksheet,
): TipoPlanilha {
  const nomePlanilha = normalizar(worksheet.name);
  if (nomePlanilha.includes('distribuidor')) return 'DISTRIBUIDORES';
  if (nomePlanilha.includes('vendedor')) return 'VENDEDORES';
  if (nomePlanilha.includes('cliente')) return 'CLIENTES';

  const header = worksheet.getRow(1);
  const headersNormalizados = new Set<string>();
  for (let col = 1; col <= header.cellCount; col += 1) {
    const valor = texto(header.getCell(col).value);
    if (valor) headersNormalizados.add(normalizar(valor));
  }

  if (headersNormalizados.has('nomedistribuidor')) return 'VENDEDORES';
  if (headersNormalizados.has('nomevendedor')) return 'CLIENTES';
  if (headersNormalizados.has('totalvendedores')) return 'DISTRIBUIDORES';

  return 'DESCONHECIDA';
}

export function mapearPorNome(
  registros: Array<{ id: string; nome: string }>,
): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const registro of registros) {
    const chave = normalizar(registro.nome);
    if (!chave) continue;
    const atual = mapa.get(chave) ?? [];
    atual.push(registro.id);
    mapa.set(chave, atual);
  }
  return mapa;
}

export function buscarRelacionamentoPorNome(
  nome: string,
  mapa: Map<string, string[]>,
): string | null {
  const chave = normalizar(nome);
  const ids = mapa.get(chave) ?? [];
  if (ids.length !== 1) return null;
  return ids[0];
}

export function novaContagem(): ContagemImportacao {
  return { lidos: 0, criados: 0, atualizados: 0, ignorados: 0, erros: 0 };
}

export function texto(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const v = value.trim();
    return v ? v : null;
  }
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('text' in value && value.text) return String(value.text).trim();
    if (
      'result' in value &&
      value.result !== null &&
      value.result !== undefined
    ) {
      if (
        typeof value.result === 'string' ||
        typeof value.result === 'number' ||
        typeof value.result === 'boolean' ||
        typeof value.result === 'bigint'
      ) {
        return String(value.result).trim();
      }
    }
  }
  return null;
}

export function numero(value: ExcelJS.CellValue): number | null {
  const txt = texto(value);
  if (!txt) return null;
  const digits = txt.replace(/\D/g, '');
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

export function cpf(value: ExcelJS.CellValue): string | null {
  const txt = texto(value);
  if (!txt) return null;
  const digits = txt.replace(/\D/g, '');
  if (!digits) return null;
  const cpfValue = digits.length < 11 ? digits.padStart(11, '0') : digits;
  return cpfValue.length === 11 ? cpfValue : null;
}

export function data(value: ExcelJS.CellValue): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const txt = texto(value);
  if (!txt) return undefined;
  const parsed = new Date(txt);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function email(value: ExcelJS.CellValue): string | null {
  const txt = texto(value);
  if (!txt) return null;
  const match = txt.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  if (!match) return null;
  return match[0].toLowerCase();
}

export function extrairNomeRelacionamento(
  campos: Array<string | null>,
): string | null {
  for (const valor of campos) {
    if (!valor) continue;
    const semEmail = valor
      .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!semEmail || /^\d+$/.test(semEmail)) continue;
    return semEmail;
  }

  return null;
}

export function gerarEmailUsuarioVendedorImportacao(
  cpfValue: string,
  rowNumber: number,
): string {
  return `${cpfValue}.${rowNumber}.${randomUUID().slice(0, 8)}@vendedor-import.local`;
}

export function gerarEmailUsuarioMigradoConflito(
  cpfValue: string,
  perfil: Perfil,
): string {
  return `${cpfValue}.${perfil.toLowerCase()}.${randomUUID().slice(0, 8)}@migracao.local`;
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function normalizar(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function quebrarEmLotes<T>(items: T[], tamanhoLote: number): T[][] {
  const lotes: T[][] = [];
  for (let index = 0; index < items.length; index += tamanhoLote) {
    lotes.push(items.slice(index, index + tamanhoLote));
  }
  return lotes;
}
