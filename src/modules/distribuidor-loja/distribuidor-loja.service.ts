import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DistribuidorLojaService {
  private readonly logger = new Logger(DistribuidorLojaService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async getDistribuidor(distribuidorId: string) {
    const d = await this.prisma.distribuidor.findUnique({ where: { id: distribuidorId } });
    if (!d) throw new NotFoundException('Distribuidor não encontrado');
    return d;
  }

  // ─── Perfil ───────────────────────────────────────────────────────────────
  async getPerfil(distribuidorId: string) {
    const distribuidor = await this.getDistribuidor(distribuidorId);
    return { message: 'Perfil do distribuidor', data: distribuidor };
  }

  // ─── Vendedores ───────────────────────────────────────────────────────────
  async getVendedores(distribuidorId: string) {
    const vendedores = await this.prisma.vendedor.findMany({
      where: { distribuidorId },
      orderBy: { createdAt: 'desc' },
    });
    return { message: 'Vendedores do distribuidor', data: vendedores };
  }

  async createVendedor(distribuidorId: string, dto: {
    nome: string;
    cpf: string;
    email: string;
    telefone: string;
    comissaoPercent?: number;
    senha: string;
  }) {
    const { senha, ...perfil } = dto;

    // Verifica se o distribuidor existe e está ativo
    await this.getDistribuidor(distribuidorId);

    // CPF único
    const cpfLimpo = dto.cpf.replace(/\D/g, '');
    const cpfExistente = await this.prisma.vendedor.findUnique({ where: { cpf: cpfLimpo } });
    if (cpfExistente) throw new BadRequestException('CPF já cadastrado');

    // Email único
    const emailExistente = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (emailExistente) throw new BadRequestException('Email já cadastrado');

    const bcrypt = await import('bcrypt');
    const senhaHash = await bcrypt.hash(senha, 10);

    const result = await this.prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: { email: dto.email, senhaHash, perfil: 'VENDEDOR' },
      });
      const vendedor = await tx.vendedor.create({
        data: {
          usuarioId: usuario.id,
          distribuidorId,
          nome: perfil.nome,
          cpf: cpfLimpo,
          email: perfil.email,
          telefone: perfil.telefone,
          comissaoPercent: perfil.comissaoPercent ?? 0,
        },
      });
      return vendedor;
    });

    this.logger.log(`DISTRIBUIDOR ${distribuidorId} criou vendedor ${result.id}`);
    return { message: 'Vendedor criado com sucesso', data: result };
  }

  // ─── Vendas ───────────────────────────────────────────────────────────────
  async getVendas(distribuidorId: string, params: {
    page?: number;
    limit?: number;
    status?: string;
  }) {
    const { page = 1, limit = 20, status } = params;

    // Busca IDs dos vendedores do distribuidor
    const vendedores = await this.prisma.vendedor.findMany({
      where: { distribuidorId },
      select: { id: true },
    });
    const vendedorIds = vendedores.map((v) => v.id);

    const where = {
      OR: [
        { distribuidorId },
        { vendedorId: { in: vendedorIds } },
      ],
      ...(status ? { status: status as never } : {}),
    };

    const [total, vendas] = await this.prisma.$transaction([
      this.prisma.venda.count({ where }),
      this.prisma.venda.findMany({
        where,
        include: { cliente: true, vendedor: { select: { nome: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { message: 'Vendas do distribuidor', data: { total, page, limit, vendas } };
  }

  // ─── Relatório de Performance por Etapa ──────────────────────────────────
  async getPerformancePorEtapa(distribuidorId: string) {
    const vendedores = await this.prisma.vendedor.findMany({
      where: { distribuidorId },
      select: { id: true, nome: true },
    });
    const vendedorIds = vendedores.map((v) => v.id);

    // Agrupa vendas por status/etapa e vendedor
    const vendas = await this.prisma.venda.groupBy({
      by: ['status', 'vendedorId'],
      where: {
        OR: [{ distribuidorId }, { vendedorId: { in: vendedorIds } }],
      },
      _count: { id: true },
      _sum: { total: true },
    });

    // Formata resultado
    const resultado: Record<string, { vendedorId: string | null; nome: string; quantidade: number; total: number }[]> = {};
    for (const item of vendas) {
      const etapa = item.status;
      if (!resultado[etapa]) resultado[etapa] = [];
      const vendedor = vendedores.find((v) => v.id === item.vendedorId);
      resultado[etapa].push({
        vendedorId: item.vendedorId,
        nome: vendedor?.nome ?? 'Distribuidor',
        quantidade: item._count.id,
        total: Number(item._sum.total ?? 0),
      });
      // Ordenar por quantidade desc
      resultado[etapa].sort((a, b) => b.quantidade - a.quantidade);
    }

    return { message: 'Performance por etapa', data: resultado };
  }

  // ─── Saques ───────────────────────────────────────────────────────────────
  async getSaques(distribuidorId: string) {
    const saques = await this.prisma.saque.findMany({
      where: { distribuidorId, tipo: 'DISTRIBUIDOR' },
      orderBy: { createdAt: 'desc' },
    });
    return { message: 'Saques do distribuidor', data: saques };
  }

  async criarSaque(distribuidorId: string, valor: number) {
    const distribuidor = await this.getDistribuidor(distribuidorId);
    if (Number(distribuidor.saldo) < valor) {
      throw new BadRequestException('Saldo insuficiente para saque');
    }
    if (valor <= 0) throw new BadRequestException('Valor do saque deve ser positivo');

    const saque = await this.prisma.saque.create({
      data: { distribuidorId, tipo: 'DISTRIBUIDOR', valor, status: 'SOLICITADO' },
    });

    this.logger.log(`DISTRIBUIDOR ${distribuidorId} solicitou saque de R$${valor}`);
    return { message: 'Saque solicitado com sucesso', data: saque };
  }
}
