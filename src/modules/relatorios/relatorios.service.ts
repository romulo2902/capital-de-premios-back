import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../prisma/prisma.service';

type PdfDocument = InstanceType<typeof PDFDocument>;

type FiltrosRelatorioVendedores = {
  dataInicio?: string;
  dataFim?: string;
  distribuidor?: string;
  ordenarPor?: string;
};

type FiltrosRelatorioDistribuidores = {
  dataInicio?: string;
  dataFim?: string;
  ordenarPor?: string;
};

type FiltrosRelatorioClientes = {
  dataInicio?: string;
  dataFim?: string;
  vendedor?: string;
  ordenarPor?: string;
};

type VendedorRelatorioRow = {
  codigo: number;
  createdAt: Date;
  nome: string;
  cpf: string;
  telefone: string;
  dataNascimento: Date | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  cidade: string | null;
  bairro: string | null;
  estado: string | null;
  email: string;
  distribuidorNome: string;
  nivel: number;
  totalClientes: number;
};

type DistribuidorRelatorioRow = {
  codigo: number;
  createdAt: Date;
  nome: string;
  cpf: string;
  telefone: string;
  dataNascimento: Date | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  cidade: string | null;
  bairro: string | null;
  estado: string | null;
  email: string;
  totalVendedores: number;
};

type ClienteRelatorioRow = {
  codigo: number;
  createdAt: Date;
  nome: string;
  cpf: string;
  telefone: string;
  dataNascimento: Date | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  cidade: string | null;
  bairro: string | null;
  estado: string | null;
  email: string | null;
  vendedorNome: string;
  numeroAleatorio: string;
};

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
    const clientes = await this.buscarClientesRelatorio(filtros);

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
        ],
      },
    };
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
    if (!dataInicio && !dataFim) {
      return;
    }

    where.createdAt = {};

    if (dataInicio) {
      (where.createdAt as Record<string, unknown>).gte =
        this.parseDataRelatorio(dataInicio, 'inicio');
    }

    if (dataFim) {
      (where.createdAt as Record<string, unknown>).lte =
        this.parseDataRelatorio(dataFim, 'fim');
    }
  }

  private parseDataRelatorio(
    value: string,
    boundary: 'inicio' | 'fim',
  ): Date {
    const rawValue = value.trim();
    const isoDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawValue);
    if (isoDateMatch) {
      const year = Number(isoDateMatch[1]);
      const month = Number(isoDateMatch[2]);
      const day = Number(isoDateMatch[3]);

      return this.buildCalendarDate(year, month, day, boundary);
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

  private buildCalendarDate(
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

  private formatarPercentual(value: number): string {
    const percentual = Number.isInteger(value) ? value.toString() : value.toFixed(2);
    return `${percentual}%`;
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

  private ordenarClientesRelatorio(
    rows: ClienteRelatorioRow[],
    ordenarPor?: string,
  ): ClienteRelatorioRow[] {
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
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  private formatarCodigo(codigo: number): string {
    return String(codigo).padStart(4, '0');
  }

  private formatarData(data?: Date | null): string {
    return data ? data.toLocaleDateString('pt-BR') : '';
  }

  private formatarDataHora(data: Date): string {
    return data.toLocaleString('pt-BR');
  }

  private valorPlanilha(
    value: string | number | null | undefined,
  ): string | number {
    return value ?? '';
  }

  private valorPlanilhaTexto(
    value: string | number | null | undefined,
  ): string {
    return value === null || value === undefined ? '' : String(value);
  }

  private formatarNumeroAleatorio(
    value: bigint | number | string | null | undefined,
  ): string {
    if (value === null || value === undefined) {
      return '';
    }

    return String(value).padStart(5, '0');
  }

  private aplicarFormatoTextoColunas(
    sheet: ExcelJS.Worksheet,
    keys: string[],
  ): void {
    for (const key of keys) {
      const column = sheet.getColumn(key);
      column.numFmt = '@';
    }
  }

  private calcularAlturaLinhaTabelaPdf(
    doc: PdfDocument,
    cells: Array<{ text: string; width: number }>,
  ): number {
    const heights = cells.map((cell) =>
      doc.heightOfString(cell.text, {
        width: cell.width - 10,
        align: 'left',
      }),
    );

    return Math.max(24, Math.max(...heights) + 10);
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
    let x = startX;

    for (const cell of cells) {
      doc.rect(x, y, cell.width, rowHeight).stroke();
      doc
        .font(cell.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(cell.bold ? 8.5 : 8.5)
        .text(cell.text, x + 4, y + 8, {
          width: cell.width - 8,
          align: cell.align ?? 'left',
        });
      x += cell.width;
    }
  }

  private resolverNumeroAleatorioCliente(
    vendas: Array<{
      bilhetes: Array<{
        numero: bigint;
      }>;
    }>,
  ): string {
    const numero = vendas[0]?.bilhetes[0]?.numero;
    return this.formatarNumeroAleatorio(numero);
  }
}
