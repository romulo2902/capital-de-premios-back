import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';

@Injectable()
export class VendedorLojaService {
  private readonly logger = new Logger(VendedorLojaService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async getVendedor(vendedorId: string) {
    const v = await this.prisma.vendedor.findUnique({
      where: { id: vendedorId },
    });
    if (!v) throw new NotFoundException('Vendedor não encontrado');
    return v;
  }

  // ─── Perfil ───────────────────────────────────────────────────────────────
  async getPerfil(vendedorId: string) {
    const vendedor = await this.getVendedor(vendedorId);
    return { message: 'Perfil do vendedor', data: vendedor };
  }

  // ─── Vendas próprias (RF-V02) ─────────────────────────────────────────────
  async getVendas(
    vendedorId: string,
    params: { page?: number; limit?: number; status?: string },
  ) {
    const pagination = normalizePagination(params.page, params.limit);
    const { status } = params;
    const where = {
      vendedorId,
      ...(status ? { status: status as never } : {}),
    };

    const [total, vendas] = await this.prisma.$transaction([
      this.prisma.venda.count({ where }),
      this.prisma.venda.findMany({
        where,
        include: { cliente: { select: { nome: true, cpf: true } } },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
    ]);

    return buildPaginatedResponse(
      vendas,
      total,
      pagination.page,
      pagination.limit,
      {
        successMessage: 'Vendas do vendedor listadas com sucesso',
        emptyMessage: 'Nenhuma venda encontrada para este vendedor',
      },
    );
  }

  // ─── Comissões (RF-V03) ───────────────────────────────────────────────────
  async getComissoes(
    vendedorId: string,
    params: { page?: number; limit?: number; status?: string },
  ) {
    const pagination = normalizePagination(params.page, params.limit);
    const { status } = params;
    const where = {
      vendedorId,
      ...(status ? { status: status as never } : {}),
    };

    const [total, comissoes, totalAcumulado] = await this.prisma.$transaction([
      this.prisma.comissao.count({ where }),
      this.prisma.comissao.findMany({
        where,
        include: {
          venda: { select: { total: true, status: true, createdAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      this.prisma.comissao.aggregate({
        where: { vendedorId, status: 'PAGO' },
        _sum: { valor: true },
      }),
    ]);

    return {
      ...buildPaginatedResponse(
        comissoes,
        total,
        pagination.page,
        pagination.limit,
        {
          successMessage: 'Comissões do vendedor listadas com sucesso',
          emptyMessage: 'Nenhuma comissão encontrada para este vendedor',
        },
      ),
      summary: {
        totalAcumuladoPago: Number(totalAcumulado._sum.valor ?? 0),
      },
    };
  }

  // ─── Saques (RF-V04 / RF-V05) ─────────────────────────────────────────────
  async getSaques(
    vendedorId: string,
    params: { page?: number; limit?: number },
  ) {
    const pagination = normalizePagination(params.page, params.limit);
    const where = { vendedorId, tipo: 'VENDEDOR' as const };

    const [saques, total] = await this.prisma.$transaction([
      this.prisma.saque.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      this.prisma.saque.count({ where }),
    ]);

    return buildPaginatedResponse(
      saques,
      total,
      pagination.page,
      pagination.limit,
      {
        successMessage: 'Saques do vendedor listados com sucesso',
        emptyMessage: 'Nenhum saque encontrado para este vendedor',
      },
    );
  }

  async criarSaque(vendedorId: string, valor: number) {
    const vendedor = await this.getVendedor(vendedorId);
    if (Number(vendedor.saldo) < valor) {
      throw new BadRequestException('Saldo insuficiente para saque');
    }
    if (valor <= 0)
      throw new BadRequestException('Valor do saque deve ser positivo');

    const saque = await this.prisma.saque.create({
      data: { vendedorId, tipo: 'VENDEDOR', valor, status: 'SOLICITADO' },
    });

    this.logger.log(`VENDEDOR ${vendedorId} solicitou saque de R$${valor}`);
    return { message: 'Saque solicitado com sucesso', data: saque };
  }
}
