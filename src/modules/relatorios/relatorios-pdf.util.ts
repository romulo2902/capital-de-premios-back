import { PdfDocument, PdfTableCell } from './relatorios.types';

export function calcularAlturaLinhaTabelaPdf(
  doc: PdfDocument,
  cells: Array<Pick<PdfTableCell, 'text' | 'width'>>,
): number {
  const heights = cells.map((cell) =>
    doc.heightOfString(cell.text, {
      width: cell.width - 10,
      align: 'left',
    }),
  );

  return Math.max(24, Math.max(...heights) + 10);
}

export function desenharLinhaTabelaPdf(
  doc: PdfDocument,
  startX: number,
  y: number,
  cells: PdfTableCell[],
  rowHeight: number,
): void {
  let x = startX;

  for (const cell of cells) {
    doc.rect(x, y, cell.width, rowHeight).stroke();
    doc
      .font(cell.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(8.5)
      .text(cell.text, x + 4, y + 8, {
        width: cell.width - 8,
        align: cell.align ?? 'left',
      });
    x += cell.width;
  }
}
