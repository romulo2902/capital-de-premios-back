import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../../common/utils/pagination.util';

@Injectable()
export class CartelasSenaService {
  private readonly logger = new Logger(CartelasSenaService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── ÁREA DO CLIENTE ──────────────────────────────────

  async listarCartelasCliente(
    cpf: string,
    page = 1,
    limit = 20,
    edicaoSenaId?: string,
  ) {
    const cpfLimpo = cpf.replace(/\D/g, '');
    const pagination = normalizePagination(page, limit);

    const cliente = await this.prisma.cliente.findUnique({
      where: { cpf: cpfLimpo },
      select: { id: true },
    });
    if (!cliente) return { message: 'Nenhuma cartela encontrada', data: [], meta: {} };

    const where: Record<string, unknown> = {
      vendaSena: {
        clienteId: cliente.id,
        status: 'APROVADO',
      },
      ...(edicaoSenaId ? { edicaoSenaId } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.cartelaSena.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          edicaoSena: {
            select: {
              id: true,
              numero: true,
              dataSorteioMegaSena: true,
              status: true,
              resultado: {
                select: { numerosSorteados: true, apurado: true },
              },
            },
          },
        },
      }),
      this.prisma.cartelaSena.count({ where }),
    ]);

    return buildPaginatedResponse(
      data.map((c) => this.serializar(c)),
      total,
      pagination.page,
      pagination.limit,
      {
        successMessage: 'Cartelas Sena listadas com sucesso',
        emptyMessage: 'Nenhuma cartela Sena encontrada',
      },
    );
  }

  async detalharCartela(id: string, cpf?: string) {
    const cartela = await this.prisma.cartelaSena.findUnique({
      where: { id },
      include: {
        edicaoSena: {
          select: {
            id: true,
            numero: true,
            dataSorteioMegaSena: true,
            status: true,
            resultado: {
              select: { numerosSorteados: true, apurado: true, imagemResultadoUrl: true },
            },
            premios: true,
          },
        },
        vendaSena: {
          select: {
            cliente: { select: { cpf: true, nome: true } },
            status: true,
            tipoPagamento: true,
            createdAt: true,
          },
        },
      },
    });

    if (!cartela) throw new NotFoundException('Cartela Sena não encontrada');

    // Verificar propriedade se cpf fornecido (área do cliente)
    if (cpf) {
      const cpfLimpo = cpf.replace(/\D/g, '');
      if (cartela.vendaSena.cliente.cpf !== cpfLimpo) {
        throw new NotFoundException('Cartela Sena não encontrada');
      }
    }

    return { message: 'Cartela Sena encontrada', data: this.serializar(cartela) };
  }

  // ─── ADMIN ────────────────────────────────────────────

  async listarPorEdicao(edicaoSenaId: string, page = 1, limit = 20) {
    const pagination = normalizePagination(page, limit);

    const [data, total] = await Promise.all([
      this.prisma.cartelaSena.findMany({
        where: { edicaoSenaId },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          vendaSena: {
            select: {
              cliente: { select: { nome: true, cpf: true } },
              vendedor: { select: { nome: true, codigo: true } },
              status: true,
            },
          },
        },
      }),
      this.prisma.cartelaSena.count({ where: { edicaoSenaId } }),
    ]);

    return buildPaginatedResponse(
      data.map((c) => this.serializar(c)),
      total,
      pagination.page,
      pagination.limit,
      {
        successMessage: 'Cartelas Sena da edição listadas',
        emptyMessage: 'Nenhuma cartela Sena encontrada para esta edição',
      },
    );
  }

  // ─── HELPERS ──────────────────────────────────────────

  private serializar(cartela: Record<string, unknown>) {
    return cartela;
  }
}
