import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import * as ExcelJS from 'exceljs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RelatoriosService {
  private readonly logger = new Logger(RelatoriosService.name);

  constructor(private readonly prisma: PrismaService) {}

  async exportarVendasXlsx(
    res: Response,
    filtros: { dataInicio?: string; dataFim?: string; edicaoId?: string },
  ): Promise<void> {
    this.logger.log('Gerando relatório XLSX de vendas');

    const where: Record<string, unknown> = {};
    if (filtros.edicaoId) where.edicaoId = filtros.edicaoId;
    if (filtros.dataInicio || filtros.dataFim) {
      where.createdAt = {};
      if (filtros.dataInicio) (where.createdAt as Record<string, unknown>).gte = new Date(filtros.dataInicio);
      if (filtros.dataFim) (where.createdAt as Record<string, unknown>).lte = new Date(filtros.dataFim);
    }

    const vendas = await this.prisma.venda.findMany({
      where,
      include: { cliente: true, vendedor: true },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Capital de Prêmios';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Vendas');
    sheet.columns = [
      { header: 'ID', key: 'id', width: 28 },
      { header: 'Data', key: 'data', width: 20 },
      { header: 'Cliente', key: 'cliente', width: 30 },
      { header: 'CPF', key: 'cpf', width: 15 },
      { header: 'Vendedor', key: 'vendedor', width: 25 },
      { header: 'Qtd Bilhetes', key: 'quantidade', width: 14 },
      { header: 'Total (R$)', key: 'total', width: 14 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Pagamento', key: 'pagamento', width: 12 },
    ];

    // Header style
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2E4057' },
    };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    for (const venda of vendas) {
      sheet.addRow({
        id: venda.id,
        data: venda.createdAt.toLocaleDateString('pt-BR'),
        cliente: venda.cliente.nome,
        cpf: venda.cliente.cpf,
        vendedor: venda.vendedor?.nome ?? '-',
        quantidade: venda.quantidade,
        total: Number(venda.total).toFixed(2),
        status: venda.status,
        pagamento: venda.tipoPagamento,
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=vendas-${Date.now()}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  }

  async exportarComissoesPdf(res: Response): Promise<void> {
    this.logger.log('Gerando relatório PDF de comissões');

    const comissoes = await this.prisma.comissao.findMany({
      include: { vendedor: true, venda: true },
      orderBy: { createdAt: 'desc' },
    });

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=comissoes-${Date.now()}.pdf`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('Capital de Prêmios', { align: 'center' });
    doc.fontSize(14).font('Helvetica').text('Relatório de Comissões', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, { align: 'right' });
    doc.moveDown();

    // Table header
    const tableTop = doc.y;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Vendedor', 50, tableTop);
    doc.text('Venda ID', 200, tableTop);
    doc.text('Valor (R$)', 340, tableTop);
    doc.text('Status', 440, tableTop);
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

    let y = tableTop + 25;
    doc.font('Helvetica').fontSize(9);

    for (const comissao of comissoes) {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
      doc.text(comissao.vendedor.nome, 50, y);
      doc.text(comissao.vendaId.slice(0, 12) + '...', 200, y);
      doc.text(`R$ ${Number(comissao.valor).toFixed(2)}`, 340, y);
      doc.text(comissao.status, 440, y);
      y += 20;
    }

    doc.end();
  }

  async findAll(): Promise<{ message: string; data: unknown }> {
    return { message: 'Módulo de relatórios', data: { endpoints: ['/relatorios/vendas/xlsx', '/relatorios/comissoes/pdf'] } };
  }
}
