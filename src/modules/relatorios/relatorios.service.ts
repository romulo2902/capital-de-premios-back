import { Injectable, Logger } from '@nestjs/common';
import {
  OrigemParticipacao,
  StatusVenda,
  StatusVendaSena,
  TipoCartela,
} from '@prisma/client';
import type { Response } from 'express';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../prisma/prisma.service';
import { calcularQuantidadeCartelasDaVenda } from '../vendas/vendas-quantidade.util';
import {
  aplicarFiltroPeriodoCadastro as aplicarFiltroPeriodoCadastroUtil,
  aplicarFormatoTextoColunas as aplicarFormatoTextoColunasUtil,
  formatarCodigo as formatarCodigoUtil,
  formatarCpf as formatarCpfUtil,
  formatarData as formatarDataUtil,
  formatarDataHora as formatarDataHoraUtil,
  formatarNumeroAleatorio as formatarNumeroAleatorioUtil,
  formatarPercentual as formatarPercentualUtil,
  parseDataRelatorio as parseDataRelatorioUtil,
  resolverNumeroAleatorioCliente as resolverNumeroAleatorioClienteUtil,
  valorPlanilha as valorPlanilhaUtil,
  valorPlanilhaTexto as valorPlanilhaTextoUtil,
} from './relatorios-formatters.util';
import {
  calcularAlturaLinhaTabelaPdf as calcularAlturaLinhaTabelaPdfUtil,
  desenharLinhaTabelaPdf as desenharLinhaTabelaPdfUtil,
} from './relatorios-pdf.util';
import type {
  ClienteRelatorioPdfRow,
  ClienteRelatorioRow,
  DistribuidorRelatorioRow,
  FiltrosRelatorioClientes,
  FiltrosRelatorioDistribuidores,
  FiltrosRelatorioVendedores,
  PdfDocument,
  VendedorRelatorioRow,
} from './relatorios.types';

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
    this.aplicarFiltroPeriodoCadastro(
      where,
      filtros.dataInicio,
      filtros.dataFim,
    );

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
      { header: 'Qtd Cartelas', key: 'quantidade', width: 14 },
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
        quantidade: calcularQuantidadeCartelasDaVenda({
          quantidade: venda.quantidade,
          tipoCartela: venda.tipoCartela as TipoCartela | null,
        }),
        total: Number(venda.total).toFixed(2),
        status: venda.status,
        pagamento: venda.tipoPagamento,
      });
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=vendas-${Date.now()}.xlsx`,
    );
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
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=comissoes-${Date.now()}.pdf`,
    );
    doc.pipe(res);

    // Header
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('Capital de Prêmios', { align: 'center' });
    doc
      .fontSize(14)
      .font('Helvetica')
      .text('Relatório de Comissões', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, {
      align: 'right',
    });
    doc.moveDown();

    // Table header
    const tableTop = doc.y;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Vendedor', 50, tableTop);
    doc.text('Venda ID', 200, tableTop);
    doc.text('Valor (R$)', 340, tableTop);
    doc.text('Status', 440, tableTop);
    doc
      .moveTo(50, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .stroke();

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

  async exportarVendedoresXlsx(
    res: Response,
    filtros: FiltrosRelatorioVendedores,
  ): Promise<void> {
    this.logger.log('Gerando relatório XLSX de vendedores');
    const vendedores = await this.buscarVendedoresRelatorio(filtros);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Capital de Prêmios';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Vendedores');
    sheet.columns = [
      { header: 'Código', key: 'codigo', width: 10 },
      { header: 'Data Cadastro', key: 'dataCadastro', width: 20 },
      { header: 'Nome', key: 'nome', width: 28 },
      { header: 'CPF', key: 'cpf', width: 16 },
      { header: 'Telefone', key: 'telefone', width: 18 },
      { header: 'Data Nascimento', key: 'dataNascimento', width: 18 },
      { header: 'CEP', key: 'cep', width: 14 },
      { header: 'Endereço', key: 'endereco', width: 24 },
      { header: 'Número Endereço', key: 'numero', width: 18 },
      { header: 'Cidade', key: 'cidade', width: 18 },
      { header: 'Bairro', key: 'bairro', width: 18 },
      { header: 'Estado', key: 'estado', width: 10 },
      { header: 'E-mail', key: 'email', width: 28 },
      { header: 'Nome Distribuidor', key: 'distribuidorNome', width: 28 },
      { header: 'Nível', key: 'nivel', width: 12 },
      { header: 'Total Clientes', key: 'totalClientes', width: 14 },
    ];

    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2E4057' },
    };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    this.aplicarFormatoTextoColunas(sheet, [
      'codigo',
      'cpf',
      'telefone',
      'dataNascimento',
      'cep',
      'numero',
      'estado',
      'email',
    ]);

    for (const vendedor of vendedores) {
      sheet.addRow({
        codigo: this.formatarCodigo(vendedor.codigo),
        dataCadastro: this.formatarDataHora(vendedor.createdAt),
        nome: vendedor.nome,
        cpf: this.formatarCpf(vendedor.cpf),
        telefone: this.valorPlanilhaTexto(vendedor.telefone),
        dataNascimento: this.valorPlanilhaTexto(
          this.formatarData(vendedor.dataNascimento),
        ),
        cep: this.valorPlanilhaTexto(vendedor.cep),
        endereco: this.valorPlanilha(vendedor.endereco),
        numero: this.valorPlanilhaTexto(vendedor.numero),
        cidade: this.valorPlanilha(vendedor.cidade),
        bairro: this.valorPlanilha(vendedor.bairro),
        estado: this.valorPlanilhaTexto(vendedor.estado),
        email: this.valorPlanilhaTexto(vendedor.email),
        distribuidorNome: vendedor.distribuidorNome,
        nivel: this.formatarPercentual(vendedor.nivel),
        totalClientes: vendedor.totalClientes,
      });
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=vendedores-${Date.now()}.xlsx`,
    );
    await workbook.xlsx.write(res);
    res.end();
  }

  async exportarVendedoresPdf(
    res: Response,
    filtros: FiltrosRelatorioVendedores,
  ): Promise<void> {
    this.logger.log('Gerando relatório PDF de vendedores');
    const vendedores = await this.buscarVendedoresRelatorio(filtros);

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=vendedores-${Date.now()}.pdf`,
    );
    doc.pipe(res);

    doc.font('Helvetica-Bold').fontSize(14).text('Vendedores', {
      align: 'center',
    });
    doc.moveDown(1.2);

    const columns = [
      { header: 'Nome', key: 'nome', width: 150 },
      { header: 'Telefone', key: 'telefone', width: 90 },
      { header: 'E-mail', key: 'email', width: 140 },
      { header: 'Distribuidor', key: 'distribuidorNome', width: 90 },
      { header: 'Nível', key: 'nivel', width: 55 },
      { header: 'Total Clientes', key: 'totalClientes', width: 70 },
    ] as const;

    const startX = 22;
    let y = doc.y;

    this.desenharLinhaTabelaPdf(
      doc,
      startX,
      y,
      columns.map((column) => ({
        text: column.header,
        width: column.width,
        bold: true,
      })),
      28,
    );

    y += 28;

    for (const vendedor of vendedores) {
      const cells = [
        { text: vendedor.nome, width: columns[0].width },
        { text: vendedor.telefone, width: columns[1].width },
        { text: vendedor.email, width: columns[2].width },
        { text: vendedor.distribuidorNome, width: columns[3].width },
        {
          text: this.formatarPercentual(vendedor.nivel),
          width: columns[4].width,
          align: 'center' as const,
        },
        {
          text: String(vendedor.totalClientes),
          width: columns[5].width,
          align: 'center' as const,
        },
      ];

      const rowHeight = this.calcularAlturaLinhaTabelaPdf(doc, cells);

      if (y + rowHeight > 760) {
        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(14).text('Vendedores', {
          align: 'center',
        });
        doc.moveDown(1.2);
        y = doc.y;
        this.desenharLinhaTabelaPdf(
          doc,
          startX,
          y,
          columns.map((column) => ({
            text: column.header,
            width: column.width,
            bold: true,
          })),
          28,
        );
        y += 28;
      }

      this.desenharLinhaTabelaPdf(doc, startX, y, cells, rowHeight);
      y += rowHeight;
    }

    doc.end();
  }

  async exportarDistribuidoresXlsx(
    res: Response,
    filtros: FiltrosRelatorioDistribuidores,
  ): Promise<void> {
    this.logger.log('Gerando relatório XLSX de distribuidores');
    const distribuidores = await this.buscarDistribuidoresRelatorio(filtros);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Capital de Prêmios';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Distribuidores');
    sheet.columns = [
      { header: 'Código', key: 'codigo', width: 10 },
      { header: 'Data Cadastro', key: 'dataCadastro', width: 20 },
      { header: 'Nome', key: 'nome', width: 30 },
      { header: 'CPF', key: 'cpf', width: 16 },
      { header: 'Telefone', key: 'telefone', width: 18 },
      { header: 'Data Nascimento', key: 'dataNascimento', width: 18 },
      { header: 'Cep', key: 'cep', width: 14 },
      { header: 'Endereço', key: 'endereco', width: 24 },
      { header: 'Número Endereço', key: 'numero', width: 18 },
      { header: 'Cidade', key: 'cidade', width: 18 },
      { header: 'Bairro', key: 'bairro', width: 20 },
      { header: 'Estado', key: 'estado', width: 10 },
      { header: 'E-mail', key: 'email', width: 28 },
      { header: 'Total Vendedores', key: 'totalVendedores', width: 16 },
    ];

    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2E4057' },
    };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    this.aplicarFormatoTextoColunas(sheet, [
      'codigo',
      'cpf',
      'telefone',
      'dataNascimento',
      'cep',
      'numero',
      'estado',
      'email',
    ]);

    for (const distribuidor of distribuidores) {
      sheet.addRow({
        codigo: this.formatarCodigo(distribuidor.codigo),
        dataCadastro: this.formatarDataHora(distribuidor.createdAt),
        nome: distribuidor.nome,
        cpf: this.formatarCpf(distribuidor.cpf),
        telefone: this.valorPlanilhaTexto(distribuidor.telefone),
        dataNascimento: this.valorPlanilhaTexto(
          this.formatarData(distribuidor.dataNascimento),
        ),
        cep: this.valorPlanilhaTexto(distribuidor.cep),
        endereco: this.valorPlanilha(distribuidor.endereco),
        numero: this.valorPlanilhaTexto(distribuidor.numero),
        cidade: this.valorPlanilha(distribuidor.cidade),
        bairro: this.valorPlanilha(distribuidor.bairro),
        estado: this.valorPlanilhaTexto(distribuidor.estado),
        email: this.valorPlanilhaTexto(distribuidor.email),
        totalVendedores: distribuidor.totalVendedores,
      });
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=distribuidores-${Date.now()}.xlsx`,
    );
    await workbook.xlsx.write(res);
    res.end();
  }

  async exportarDistribuidoresPdf(
    res: Response,
    filtros: FiltrosRelatorioDistribuidores,
  ): Promise<void> {
    this.logger.log('Gerando relatório PDF de distribuidores');
    const distribuidores = await this.buscarDistribuidoresRelatorio(filtros);

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=distribuidores-${Date.now()}.pdf`,
    );
    doc.pipe(res);

    doc.font('Helvetica-Bold').fontSize(14).text('Distribuidores', {
      align: 'left',
    });
    doc.moveDown(1.2);

    const columns = [
      { header: 'Nome', width: 190 },
      { header: 'Telefone', width: 110 },
      { header: 'E-mail', width: 180 },
      { header: 'Total Vendedores', width: 110 },
    ] as const;

    const startX = 20;
    let y = doc.y;

    this.desenharLinhaTabelaPdf(
      doc,
      startX,
      y,
      columns.map((column) => ({
        text: column.header,
        width: column.width,
        bold: true,
      })),
      22,
    );

    y += 22;

    for (const distribuidor of distribuidores) {
      const cells = [
        { text: distribuidor.nome, width: columns[0].width },
        { text: distribuidor.telefone, width: columns[1].width },
        { text: distribuidor.email, width: columns[2].width },
        {
          text: String(distribuidor.totalVendedores),
          width: columns[3].width,
          align: 'center' as const,
        },
      ];

      const rowHeight = this.calcularAlturaLinhaTabelaPdf(doc, cells);

      if (y + rowHeight > 760) {
        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(14).text('Distribuidores', {
          align: 'left',
        });
        doc.moveDown(1.2);
        y = doc.y;
        this.desenharLinhaTabelaPdf(
          doc,
          startX,
          y,
          columns.map((column) => ({
            text: column.header,
            width: column.width,
            bold: true,
          })),
          22,
        );
        y += 22;
      }

      this.desenharLinhaTabelaPdf(doc, startX, y, cells, rowHeight);
      y += rowHeight;
    }

    doc.end();
  }

  async exportarClientesXlsx(
    res: Response,
    filtros: FiltrosRelatorioClientes,
  ): Promise<void> {
    this.logger.log('Gerando relatório XLSX de clientes');
    const clientes = await this.buscarClientesRelatorio(filtros);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Capital de Prêmios';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Clientes');
    sheet.columns = [
      { header: 'Código', key: 'codigo', width: 12 },
      { header: 'Data Cadastro', key: 'dataCadastro', width: 20 },
      { header: 'Nome', key: 'nome', width: 28 },
      { header: 'CPF', key: 'cpf', width: 16 },
      { header: 'Telefone', key: 'telefone', width: 18 },
      { header: 'Data Nascimento', key: 'dataNascimento', width: 18 },
      { header: 'Cep', key: 'cep', width: 14 },
      { header: 'Endereço', key: 'endereco', width: 24 },
      { header: 'Número Endereço', key: 'numero', width: 18 },
      { header: 'Cidade', key: 'cidade', width: 18 },
      { header: 'Bairro', key: 'bairro', width: 20 },
      { header: 'Estado', key: 'estado', width: 10 },
      { header: 'E-mail', key: 'email', width: 28 },
      { header: 'Nome Vendedor', key: 'vendedorNome', width: 28 },
      { header: 'Número Aleatório', key: 'numeroAleatorio', width: 18 },
    ];

    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2E4057' },
    };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    this.aplicarFormatoTextoColunas(sheet, [
      'codigo',
      'cpf',
      'telefone',
      'dataNascimento',
      'cep',
      'numero',
      'estado',
      'email',
      'numeroAleatorio',
    ]);

    for (const cliente of clientes) {
      sheet.addRow({
        codigo: this.valorPlanilhaTexto(cliente.codigo),
        dataCadastro: this.formatarDataHora(cliente.createdAt),
        nome: cliente.nome,
        cpf: this.formatarCpf(cliente.cpf),
        telefone: this.valorPlanilhaTexto(cliente.telefone),
        dataNascimento: this.valorPlanilhaTexto(
          this.formatarData(cliente.dataNascimento),
        ),
        cep: this.valorPlanilhaTexto(cliente.cep),
        endereco: this.valorPlanilha(cliente.endereco),
        numero: this.valorPlanilhaTexto(cliente.numero),
        cidade: this.valorPlanilha(cliente.cidade),
        bairro: this.valorPlanilha(cliente.bairro),
        estado: this.valorPlanilhaTexto(cliente.estado),
        email: this.valorPlanilhaTexto(cliente.email),
        vendedorNome: this.valorPlanilha(cliente.vendedorNome),
        numeroAleatorio: this.valorPlanilhaTexto(cliente.numeroAleatorio),
      });
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=clientes-${Date.now()}.xlsx`,
    );
    await workbook.xlsx.write(res);
    res.end();
  }

  async exportarClientesPdf(
    res: Response,
    filtros: FiltrosRelatorioClientes,
  ): Promise<void> {
    this.logger.log('Gerando relatório PDF de clientes');
    const clientes = await this.buscarClientesRelatorioPdf(filtros);

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=clientes-${Date.now()}.pdf`,
    );
    doc.pipe(res);

    doc.font('Helvetica-Bold').fontSize(14).text('Clientes', {
      align: 'left',
    });
    doc.moveDown(1.2);

    const columns = [
      { header: 'Nome', width: 170 },
      { header: 'Telefone', width: 95 },
      { header: 'E-mail', width: 180 },
      { header: 'Vendedor', width: 140 },
    ] as const;

    const startX = 20;
    let y = doc.y;

    this.desenharLinhaTabelaPdf(
      doc,
      startX,
      y,
      columns.map((column) => ({
        text: column.header,
        width: column.width,
        bold: true,
      })),
      22,
    );

    y += 22;

    for (const cliente of clientes) {
      const cells = [
        { text: cliente.nome, width: columns[0].width },
        { text: cliente.telefone, width: columns[1].width },
        { text: cliente.email ?? '', width: columns[2].width },
        { text: cliente.vendedorNome, width: columns[3].width },
      ];

      const rowHeight = this.calcularAlturaLinhaTabelaPdf(doc, cells);

      if (y + rowHeight > 760) {
        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(14).text('Clientes', {
          align: 'left',
        });
        doc.moveDown(1.2);
        y = doc.y;
        this.desenharLinhaTabelaPdf(
          doc,
          startX,
          y,
          columns.map((column) => ({
            text: column.header,
            width: column.width,
            bold: true,
          })),
          22,
        );
        y += 22;
      }

      this.desenharLinhaTabelaPdf(doc, startX, y, cells, rowHeight);
      y += rowHeight;
    }

    doc.end();
  }

  findAll(): { message: string; data: unknown } {
    return {
      message: 'Módulo de relatórios',
      data: {
        endpoints: [
          '/relatorios/vendas/xlsx',
          '/relatorios/comissoes/pdf',
          '/relatorios/vendedores/xlsx',
          '/relatorios/vendedores/pdf',
          '/relatorios/distribuidores/xlsx',
          '/relatorios/distribuidores/pdf',
          '/relatorios/clientes/xlsx',
          '/relatorios/clientes/pdf',
          '/relatorios/vendas/sena',
        ],
      },
    };
  }

  async exportarRelatorioCDP(
    res: Response,
    edicaoId: string,
    dataInicio?: string,
    dataFim?: string,
  ): Promise<void> {
    this.logger.log(`Gerando relatório CDP para edição ${edicaoId}`);

    const edicao = await this.prisma.edicao.findUniqueOrThrow({
      where: { id: edicaoId },
      include: { detalhes: true },
    });

    const bilhetes = await this.prisma.bilhete.findMany({
      where: {
        edicaoId,
        venda: { status: StatusVenda.APROVADO },
      },
      include: {
        venda: {
          include: { cliente: true },
        },
      },
      orderBy: { numero: 'asc' },
    });

    const formatarDataCDP = (d: Date): string => {
      const dia = String(d.getDate()).padStart(2, '0');
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      return `${dia}/${mes}/${d.getFullYear()}`;
    };

    const hoje = new Date();
    const dataInicioFmt = dataInicio
      ? formatarDataCDP(new Date(dataInicio))
      : formatarDataCDP(hoje);
    const dataFimFmt = dataFim
      ? formatarDataCDP(new Date(dataFim))
      : formatarDataCDP(hoje);

    const removerAcentos = (str: string): string =>
      str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const linhas: string[] = [];

    linhas.push(`H;CAPDF;${dataInicioFmt};${dataFimFmt};${edicao.numero}`);

    for (const bilhete of bilhetes) {
      const { venda } = bilhete;
      const { cliente } = venda;

      const precoPorBilhete = Number(venda.total) / venda.quantidade;
      const precoFormatado = precoPorBilhete.toFixed(2);

      const numeroBilhete = this.formatarNumeroCdp(bilhete.numero);
      const cpf = this.formatarCampoNumericoCdp(cliente.cpf, 11);
      const telefone = (cliente.telefone ?? '').replace(/\D/g, '');
      const ddd = telefone.substring(0, 2);
      const cep = this.formatarCampoNumericoCdp(cliente.cep, 8);
      const uf = (cliente.estado ?? '').toUpperCase().trim();
      const cidade = removerAcentos(cliente.cidade ?? '').trim();
      const email = cliente.email ?? '';
      const origemAquisicao = this.resolverOrigemAquisicaoCdp(venda);

      linhas.push(
        `D3;${numeroBilhete};${precoFormatado};${cpf};${cliente.nome};;M;${email};${ddd};${telefone};${uf};${cep};${cidade};;;;${origemAquisicao};V;N;`,
      );
    }

    const rangesMap = new Map<string, { inicio: bigint; fim: bigint }>();
    for (const detalhe of edicao.detalhes) {
      const key = String(detalhe.rangeInicio);
      if (!rangesMap.has(key)) {
        rangesMap.set(key, {
          inicio: detalhe.rangeInicio,
          fim: detalhe.rangeFinal,
        });
      }
    }
    const ranges = [...rangesMap.values()].sort((a, b) =>
      a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0,
    );
    const rangesStr = ranges
      .map(
        (r) =>
          `${this.formatarNumeroCdp(r.inicio)};${this.formatarNumeroCdp(r.fim)}`,
      )
      .join(';');

    linhas.push(`T;${bilhetes.length};${rangesStr};`);

    const conteudo = linhas.join('\r\n');
    const nomeArquivo = `relatorio-cdp-${edicao.numero}-${Date.now()}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${nomeArquivo}`);
    res.send(conteudo);
  }

  async exportarRelatorioSena(
    res: Response,
    edicaoSenaId: string,
    dataInicio?: string,
    dataFim?: string,
  ): Promise<void> {
    this.logger.log(`Gerando relatório Sena para edição ${edicaoSenaId}`);

    const edicao = await this.prisma.edicaoSena.findUniqueOrThrow({
      where: { id: edicaoSenaId },
      select: { numero: true, valorCartela: true },
    });

    const cartelas = await this.prisma.cartelaSena.findMany({
      where: {
        edicaoSenaId,
        vendaSena: { status: StatusVendaSena.APROVADO },
      },
      include: {
        vendaSena: {
          include: {
            cliente: true,
            vendedor: { select: { nome: true } },
          },
        },
      },
      orderBy: [
        { vendaSena: { createdAt: 'asc' } },
        { createdAt: 'asc' },
      ],
    });

    const hoje = new Date();
    const dataInicioFmt = this.formatarDataArquivoSena(
      dataInicio ? this.parseDataRelatorio(dataInicio, 'inicio') : hoje,
    );
    const dataFimFmt = this.formatarDataArquivoSena(
      dataFim ? this.parseDataRelatorio(dataFim, 'fim') : hoje,
    );
    const valorCartela = this.formatarValorRelatorioSena(edicao.valorCartela);

    const linhas: string[] = [
      `H;CAPDF;${dataInicioFmt};${dataFimFmt};${edicao.numero}`,
    ];

    for (const cartela of cartelas) {
      const venda = cartela.vendaSena;
      const cliente = venda.cliente;
      const telefone = this.separarTelefoneRelatorioSena(cliente.telefone);
      const numeros = [
        ...cartela.numerosEscolhidos,
        cartela.setimoNumero,
      ].filter((numero): numero is number => typeof numero === 'number');
      const numerosFormatados = numeros
        .map((numero) => this.formatarNumeroRelatorioSena(numero))
        .join(',');
      const numeroBase = cartela.numerosEscolhidos[0]?.toString() ?? '';
      const origemAquisicao = this.resolverOrigemAquisicaoSena(venda);

      linhas.push(
        [
          'D3',
          venda.id.replace(/-/g, ''),
          numerosFormatados,
          valorCartela,
          this.formatarCampoNumericoCdp(cliente.cpf, 11),
          cliente.nome,
          '',
          '',
          '',
          telefone.ddd,
          telefone.numero,
          (cliente.estado ?? '').toUpperCase().trim(),
          this.formatarCampoNumericoCdp(cliente.cep, 8),
          cliente.cidade ?? '',
          cliente.endereco ?? '',
          cliente.bairro ?? '',
          numeroBase,
          origemAquisicao,
          'V',
          '',
        ].join(';'),
      );
    }

    linhas.push(`T;${cartelas.length};`);

    const conteudo = linhas.join('\r\n');
    const nomeArquivo = `capital_sena_${edicao.numero}_${Date.now()}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${nomeArquivo}`);
    res.send(conteudo);
  }

  private async buscarVendedoresRelatorio(
    filtros: FiltrosRelatorioVendedores,
  ): Promise<VendedorRelatorioRow[]> {
    const where: Record<string, unknown> = {};

    this.aplicarFiltroPeriodoCadastro(
      where,
      filtros.dataInicio,
      filtros.dataFim,
    );

    if (filtros.distribuidor) {
      const distribuidorBusca = filtros.distribuidor.trim();
      const distribuidorCpf = distribuidorBusca.replace(/\D/g, '');
      const termosDistribuidor: Array<Record<string, unknown>> = [
        {
          nome: {
            contains: distribuidorBusca,
            mode: 'insensitive',
          },
        },
      ];

      if (distribuidorCpf) {
        termosDistribuidor.push({
          cpf: {
            contains: distribuidorCpf,
          },
        });
      }

      where.distribuidor = {
        OR: termosDistribuidor,
      };
    }

    const vendedores = await this.prisma.vendedor.findMany({
      where,
      include: {
        distribuidor: {
          select: { nome: true },
        },
        _count: {
          select: { clientes: true },
        },
      },
    });

    const rows = vendedores.map((vendedor) => ({
      codigo: vendedor.codigo,
      createdAt: vendedor.createdAt,
      nome: vendedor.nome,
      cpf: vendedor.cpf,
      telefone: vendedor.telefone,
      dataNascimento: vendedor.dataNascimento,
      cep: vendedor.cep,
      endereco: vendedor.endereco,
      numero: vendedor.numero,
      cidade: vendedor.cidade,
      bairro: vendedor.bairro,
      estado: vendedor.estado,
      email: vendedor.email,
      distribuidorNome: vendedor.distribuidor.nome,
      nivel: Number(vendedor.comissaoPercent),
      totalClientes: vendedor._count.clientes,
    }));

    return this.ordenarVendedoresRelatorio(rows, filtros.ordenarPor);
  }

  private ordenarVendedoresRelatorio(
    rows: VendedorRelatorioRow[],
    ordenarPor?: string,
  ): VendedorRelatorioRow[] {
    const itens = [...rows];

    switch (ordenarPor) {
      case 'cliente':
      case 'totalClientes':
        return itens.sort((a, b) => b.totalClientes - a.totalClientes);
      case 'codigo':
        return itens.sort((a, b) => a.codigo - b.codigo);
      case 'nivel':
        return itens.sort((a, b) => b.nivel - a.nivel);
      case 'createdAt':
        return itens.sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );
      case 'nome':
      default:
        return itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }
  }

  private aplicarFiltroPeriodoCadastro(
    where: Record<string, unknown>,
    dataInicio?: string,
    dataFim?: string,
  ): void {
    aplicarFiltroPeriodoCadastroUtil(where, dataInicio, dataFim);
  }

  private parseDataRelatorio(value: string, boundary: 'inicio' | 'fim'): Date {
    return parseDataRelatorioUtil(value, boundary);
  }

  private buildCalendarDate(
    year: number,
    month: number,
    day: number,
    boundary: 'inicio' | 'fim',
  ): Date {
    return parseDataRelatorioUtil(
      `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
      boundary,
    );
  }

  private formatarPercentual(value: number): string {
    return formatarPercentualUtil(value);
  }

  private async buscarDistribuidoresRelatorio(
    filtros: FiltrosRelatorioDistribuidores,
  ): Promise<DistribuidorRelatorioRow[]> {
    const where: Record<string, unknown> = {};

    this.aplicarFiltroPeriodoCadastro(
      where,
      filtros.dataInicio,
      filtros.dataFim,
    );

    const distribuidores = await this.prisma.distribuidor.findMany({
      where,
      include: {
        _count: {
          select: { vendedores: true },
        },
      },
    });

    const rows = distribuidores.map((distribuidor) => ({
      codigo: distribuidor.codigo,
      createdAt: distribuidor.createdAt,
      nome: distribuidor.nome,
      cpf: distribuidor.cpf,
      telefone: distribuidor.telefone,
      dataNascimento: distribuidor.dataNascimento,
      cep: distribuidor.cep,
      endereco: distribuidor.endereco,
      numero: distribuidor.numero,
      cidade: distribuidor.cidade,
      bairro: distribuidor.bairro,
      estado: distribuidor.estado,
      email: distribuidor.email,
      totalVendedores: distribuidor._count.vendedores,
    }));

    return this.ordenarDistribuidoresRelatorio(rows, filtros.ordenarPor);
  }

  private ordenarDistribuidoresRelatorio(
    rows: DistribuidorRelatorioRow[],
    ordenarPor?: string,
  ): DistribuidorRelatorioRow[] {
    const itens = [...rows];

    switch (ordenarPor) {
      case 'distribuidores':
        return itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      case 'codigo':
        return itens.sort((a, b) => a.codigo - b.codigo);
      case 'createdAt':
        return itens.sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );
      case 'totalVendedores':
        return itens.sort((a, b) => b.totalVendedores - a.totalVendedores);
      case 'nome':
      default:
        return itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }
  }

  private async buscarClientesRelatorio(
    filtros: FiltrosRelatorioClientes,
  ): Promise<ClienteRelatorioRow[]> {
    const where = this.criarWhereClientesRelatorio(filtros);

    const clientes = await this.prisma.cliente.findMany({
      where,
      include: {
        vendedor: {
          select: { nome: true },
        },
        vendas: {
          select: {
            createdAt: true,
            bilhetes: {
              select: { numero: true },
              orderBy: { numero: 'asc' },
              take: 1,
            },
          },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    const rows = clientes.map((cliente) => ({
      codigo: cliente.codigo,
      createdAt: cliente.createdAt,
      nome: cliente.nome,
      cpf: cliente.cpf,
      telefone: cliente.telefone,
      dataNascimento: cliente.dataNascimento,
      cep: cliente.cep,
      endereco: cliente.endereco,
      numero: cliente.numero,
      cidade: cliente.cidade,
      bairro: cliente.bairro,
      estado: cliente.estado,
      email: cliente.email,
      vendedorNome: cliente.vendedor?.nome ?? '',
      numeroAleatorio: this.resolverNumeroAleatorioCliente(cliente.vendas),
    }));

    return this.ordenarClientesRelatorio(rows, filtros.ordenarPor);
  }

  private async buscarClientesRelatorioPdf(
    filtros: FiltrosRelatorioClientes,
  ): Promise<ClienteRelatorioPdfRow[]> {
    const where = this.criarWhereClientesRelatorio(filtros);

    const clientes = await this.prisma.cliente.findMany({
      where,
      select: {
        createdAt: true,
        nome: true,
        telefone: true,
        email: true,
        vendedor: {
          select: { nome: true },
        },
      },
    });

    const rows = clientes.map((cliente) => ({
      createdAt: cliente.createdAt,
      nome: cliente.nome,
      telefone: cliente.telefone,
      email: cliente.email,
      vendedorNome: cliente.vendedor?.nome ?? '',
    }));

    return this.ordenarClientesRelatorio(rows, filtros.ordenarPor);
  }

  private criarWhereClientesRelatorio(
    filtros: FiltrosRelatorioClientes,
  ): Record<string, unknown> {
    const where: Record<string, unknown> = {};

    this.aplicarFiltroPeriodoCadastro(
      where,
      filtros.dataInicio,
      filtros.dataFim,
    );

    if (filtros.vendedor) {
      const vendedorBusca = filtros.vendedor.trim();
      const vendedorCpf = vendedorBusca.replace(/\D/g, '');
      const termosVendedor: Array<Record<string, unknown>> = [
        {
          nome: {
            contains: vendedorBusca,
            mode: 'insensitive',
          },
        },
      ];

      if (vendedorCpf) {
        termosVendedor.push({
          cpf: {
            contains: vendedorCpf,
          },
        });
      }

      where.vendedor = {
        OR: termosVendedor,
      };
    }

    return where;
  }

  private ordenarClientesRelatorio<T extends { createdAt: Date }>(
    rows: T[],
    ordenarPor?: string,
  ): T[] {
    const itens = [...rows];

    switch (ordenarPor) {
      case 'maisAntigo':
        return itens.sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );
      case 'maisRecente':
      default:
        return itens.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        );
    }
  }

  private formatarCpf(cpf: string): string {
    return formatarCpfUtil(cpf);
  }

  private formatarCodigo(codigo: number): string {
    return formatarCodigoUtil(codigo);
  }

  private formatarData(data?: Date | null): string {
    return formatarDataUtil(data);
  }

  private formatarDataHora(data: Date): string {
    return formatarDataHoraUtil(data);
  }

  private valorPlanilha(
    value: string | number | null | undefined,
  ): string | number {
    return valorPlanilhaUtil(value);
  }

  private valorPlanilhaTexto(
    value: string | number | null | undefined,
  ): string {
    return valorPlanilhaTextoUtil(value);
  }

  private formatarNumeroAleatorio(
    value: bigint | number | string | null | undefined,
  ): string {
    return formatarNumeroAleatorioUtil(value);
  }

  private formatarNumeroCdp(value: bigint | number | string): string {
    return value.toString().padStart(7, '0');
  }

  private formatarCampoNumericoCdp(
    value: string | null | undefined,
    tamanho: number,
  ): string {
    const digits = (value ?? '').replace(/\D/g, '');
    return digits ? digits.padStart(tamanho, '0') : '';
  }

  private resolverOrigemAquisicaoCdp(venda: {
    origemParticipacao: OrigemParticipacao;
    gatewayPayload?: unknown;
  }): string {
    if (this.gatewayPayloadTemOrigem(venda.gatewayPayload, 'WHATSAPP')) {
      return 'Adquirido pelo WhatsApp';
    }

    if (venda.origemParticipacao === OrigemParticipacao.POS) {
      return 'Adquirido pelo POS';
    }

    return 'Adquirido pela Web';
  }

  private resolverOrigemAquisicaoSena(venda: {
    origemParticipacao: OrigemParticipacao;
    gatewayPayload?: unknown;
    vendedor?: { nome: string } | null;
  }): string {
    if (venda.vendedor?.nome) {
      return `Link ${venda.vendedor.nome}`;
    }

    if (this.gatewayPayloadTemOrigem(venda.gatewayPayload, 'WHATSAPP')) {
      return 'WhatsApp';
    }

    if (venda.origemParticipacao === OrigemParticipacao.POS) {
      return 'POS';
    }

    return 'Compra no Site';
  }

  private formatarDataArquivoSena(data: Date): string {
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}/${data.getFullYear()}`;
  }

  private formatarValorRelatorioSena(value: unknown): string {
    const valor = Number(value);
    if (!Number.isFinite(valor)) {
      return '';
    }

    return Number.isInteger(valor)
      ? valor.toString()
      : valor.toFixed(2).replace(/0$/, '');
  }

  private formatarNumeroRelatorioSena(value: number): string {
    return value.toString().padStart(2, '0');
  }

  private separarTelefoneRelatorioSena(telefone: string | null | undefined): {
    ddd: string;
    numero: string;
  } {
    let digits = (telefone ?? '').replace(/\D/g, '');
    if (digits.startsWith('55') && digits.length > 11) {
      digits = digits.slice(2);
    }

    return {
      ddd: digits.slice(0, 2),
      numero: digits.slice(2),
    };
  }

  private gatewayPayloadTemOrigem(
    gatewayPayload: unknown,
    origem: string,
  ): boolean {
    return (
      !!gatewayPayload &&
      typeof gatewayPayload === 'object' &&
      !Array.isArray(gatewayPayload) &&
      (gatewayPayload as Record<string, unknown>).origem === origem
    );
  }

  private aplicarFormatoTextoColunas(
    sheet: ExcelJS.Worksheet,
    keys: string[],
  ): void {
    aplicarFormatoTextoColunasUtil(sheet, keys);
  }

  private calcularAlturaLinhaTabelaPdf(
    doc: PdfDocument,
    cells: Array<{ text: string; width: number }>,
  ): number {
    return calcularAlturaLinhaTabelaPdfUtil(doc, cells);
  }

  private desenharLinhaTabelaPdf(
    doc: PdfDocument,
    startX: number,
    y: number,
    cells: Array<{
      text: string;
      width: number;
      bold?: boolean;
      align?: 'left' | 'center' | 'right';
    }>,
    rowHeight: number,
  ): void {
    desenharLinhaTabelaPdfUtil(doc, startX, y, cells, rowHeight);
  }

  private resolverNumeroAleatorioCliente(
    vendas: Array<{
      bilhetes: Array<{
        numero: bigint;
      }>;
    }>,
  ): string {
    return resolverNumeroAleatorioClienteUtil(vendas);
  }
}
