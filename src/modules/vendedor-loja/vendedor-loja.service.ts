import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
    const { page = 1, limit = 20, status } = params;
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
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      message: 'Vendas do vendedor',
      data: { total, page, limit, vendas },
    };
  }

  // ─── Comissões (RF-V03) ───────────────────────────────────────────────────
  async getComissoes(
    vendedorId: string,
    params: { page?: number; limit?: number; status?: string },
  ) {
    const { page = 1, limit = 20, status } = params;
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
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.comissao.aggregate({
        where: { vendedorId, status: 'PAGO' },
        _sum: { valor: true },
      }),
    ]);

    return {
      message: 'Comissões do vendedor',
      data: {
        total,
        page,
        limit,
        comissoes,
        totalAcumuladoPago: Number(totalAcumulado._sum.valor ?? 0),
      },
    };
  }

  // ─── Saques (RF-V04 / RF-V05) ─────────────────────────────────────────────
  async getSaques(vendedorId: string) {
    const saques = await this.prisma.saque.findMany({
      where: { vendedorId, tipo: 'VENDEDOR' },
      orderBy: { createdAt: 'desc' },
    });
    return { message: 'Histórico de saques', data: saques };
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
