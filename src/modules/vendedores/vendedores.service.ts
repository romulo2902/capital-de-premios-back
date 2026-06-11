import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Perfil, Prisma, StatusUsuario, StatusVenda } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { QrcodeService } from '../qrcode/qrcode.service';
import { CreateVendedorDto } from './dto/create-vendedor.dto';
import { UpdateVendedorDto } from './dto/update-vendedor.dto';
import { FiltroPerformanceDto } from './dto/filtro-performance.dto';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';
import { calcularQuantidadeCartelasDaVenda } from '../vendas/vendas-quantidade.util';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

@Injectable()
export class VendedoresService {
  private readonly logger = new Logger(VendedoresService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qrcodeService: QrcodeService,
  ) {}

  private normalizarCpf(cpf: string): string {
    return cpf.replace(/\D/g, '');
  }

  private normalizarEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private gerarSenhaPadraoPorCpf(cpf: string): string {
    return cpf.slice(0, 6);
  }

  private buildHierarchyWhere(user?: RequestUser): Prisma.VendedorWhereInput {
    if (!user || user.perfil === 'ADMIN') {
      return {};
    }

    if (user.perfil === 'DISTRIBUIDOR') {
      if (!user.distribuidorId) {
        throw new ForbiddenException(
          'Usuário distribuidor sem vínculo válido para consultar vendedores',
        );
      }

      return { distribuidorId: user.distribuidorId };
    }

    return {};
  }

  private mergeWhere(
    baseWhere: Prisma.VendedorWhereInput,
    scopeWhere: Prisma.VendedorWhereInput,
  ): Prisma.VendedorWhereInput {
    if (Object.keys(baseWhere).length === 0) {
      return scopeWhere;
    }

    if (Object.keys(scopeWhere).length === 0) {
      return baseWhere;
    }

    return {
      AND: [baseWhere, scopeWhere],
    };
  }

  private async validarCpfDisponivel(
    cpf: string,
    vendedorId?: string,
    usuarioId?: string,
  ): Promise<void> {
    const [vendedorExistente, usuarioExistente] = await Promise.all([
      this.prisma.vendedor.findFirst({
        where: {
          cpf,
          ...(vendedorId ? { NOT: { id: vendedorId } } : {}),
        },
      }),
      this.prisma.usuario.findFirst({
        where: {
          cpf,
          ...(usuarioId ? { NOT: { id: usuarioId } } : {}),
        },
      }),
    ]);

    if (vendedorExistente || usuarioExistente) {
      throw new ConflictException('CPF já cadastrado');
    }
  }

  private async validarEmailDisponivel(
    email: string,
    usuarioId?: string,
  ): Promise<void> {
    const usuarioExistente = await this.prisma.usuario.findFirst({
      where: {
        email,
        ...(usuarioId ? { NOT: { id: usuarioId } } : {}),
      },
    });

    if (usuarioExistente) {
      throw new ConflictException('Email já cadastrado');
    }
  }

  async create(dto: CreateVendedorDto) {
    const cpf = this.normalizarCpf(dto.cpf);
    const email = this.normalizarEmail(dto.email);

    await Promise.all([
      this.validarCpfDisponivel(cpf),
      this.validarEmailDisponivel(email),
    ]);

    const distribuidor = await this.prisma.distribuidor.findUnique({
      where: { id: dto.distribuidorId },
    });
    if (!distribuidor)
      throw new NotFoundException('Distribuidor não encontrado');

    const senhaHash = dto.senha
      ? await bcrypt.hash(dto.senha, 10)
      : await bcrypt.hash(this.gerarSenhaPadraoPorCpf(cpf), 10);

    return this.prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          email,
          cpf,
          senhaHash,
          perfil: Perfil.VENDEDOR,
          deveRedefinirSenha: false,
          status: StatusUsuario.ATIVO,
        },
      });

      const vendedor = await tx.vendedor.create({
        data: {
          ...(dto.codigo ? { codigo: dto.codigo } : {}),
          usuarioId: usuario.id,
          distribuidorId: dto.distribuidorId,
          nome: dto.nome,
          cpf,
          nomeRecebedor: dto.nomeRecebedor ?? dto.nome,
          telefone: dto.telefone,
          email,
          dataNascimento: dto.dataNascimento
            ? new Date(dto.dataNascimento)
            : undefined,
          cep: dto.cep,
          endereco: dto.endereco,
          numero: dto.numero,
          bairro: dto.bairro,
          cidade: dto.cidade,
          estado: dto.estado,
          tipoChavePix: dto.tipoChavePix,
          chavePix: dto.chavePix,
          comissaoPercent: dto.comissaoPercent !== undefined ? Math.min(dto.comissaoPercent, 100) : 0,
          link: dto.link,
          status: StatusUsuario.ATIVO,
        },
      });

      this.logger.log(
        `Vendedor criado: ${vendedor.nome} (${vendedor.codigo}) → dist ${distribuidor.codigo}`,
      );
      return vendedor;
    }).then(async (vendedor) => {
      try {
        await this.qrcodeService.gerarQrcodeVendedor(vendedor.id);
      } catch (err) {
        this.logger.warn(
          `Falha ao gerar QR Code para vendedor ${vendedor.id}: ${(err as Error).message}`,
        );
      }
      return vendedor;
    });
  }

  async findAll(
    page = 1,
    limit = 20,
    search?: string,
    distribuidorId?: string,
    user?: RequestUser,
  ) {
    const pagination = normalizePagination(page, limit);
    const filtersWhere: Prisma.VendedorWhereInput = {};

    if (distribuidorId) filtersWhere.distribuidorId = distribuidorId;
    if (search) {
      filtersWhere.OR = [
        { nome: { contains: search, mode: 'insensitive' } },
        { cpf: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const where = this.mergeWhere(
      filtersWhere,
      this.buildHierarchyWhere(user),
    );

    const [data, total] = await Promise.all([
      this.prisma.vendedor.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          distribuidor: { select: { id: true, nome: true, codigo: true } },
          _count: { select: { clientes: true, vendas: true } },
        },
      }),
      this.prisma.vendedor.count({ where }),
    ]);

    return buildPaginatedResponse(
      data,
      total,
      pagination.page,
      pagination.limit,
      {
        successMessage: 'Vendedores listados com sucesso',
        emptyMessage: 'Nenhum vendedor encontrado',
      },
    );
  }

  async findOne(id: string, user?: RequestUser) {
    const vendedor = await this.prisma.vendedor.findFirst({
      where: this.mergeWhere({ id }, this.buildHierarchyWhere(user)),
      include: {
        distribuidor: { select: { id: true, nome: true, codigo: true } },
        _count: { select: { clientes: true, vendas: true } },
      },
    });
    if (!vendedor) throw new NotFoundException('Vendedor não encontrado');
    return vendedor;
  }

  async findByCodigo(codigo: number, user?: RequestUser) {
    const vendedor = await this.prisma.vendedor.findFirst({
      where: this.mergeWhere({ codigo }, this.buildHierarchyWhere(user)),
    });
    if (!vendedor) throw new NotFoundException('Vendedor não encontrado');
    return vendedor;
  }

  async update(id: string, dto: UpdateVendedorDto) {
    const vendedorAtual = await this.prisma.vendedor.findUnique({
      where: { id },
      select: { id: true, usuarioId: true },
    });

    if (!vendedorAtual) {
      throw new NotFoundException('Vendedor não encontrado');
    }

    if (dto.cpf) {
      await this.validarCpfDisponivel(
        this.normalizarCpf(dto.cpf),
        id,
        vendedorAtual.usuarioId,
      );
    }

    if (dto.email) {
      await this.validarEmailDisponivel(
        this.normalizarEmail(dto.email),
        vendedorAtual.usuarioId,
      );
    }

    const data: Record<string, unknown> = { ...dto };
    delete data.senha;
    delete data.codigo;
    if (dto.cpf) data.cpf = this.normalizarCpf(dto.cpf);
    if (dto.email) data.email = this.normalizarEmail(dto.email);
    if (dto.dataNascimento) data.dataNascimento = new Date(dto.dataNascimento);
    if (dto.link !== undefined) data.qrcode = null;
    if (dto.comissaoPercent !== undefined) data.comissaoPercent = Math.min(dto.comissaoPercent, 100);

    const usuarioData: Prisma.UsuarioUpdateInput = {};
    if (dto.cpf) usuarioData.cpf = this.normalizarCpf(dto.cpf);
    if (dto.email) usuarioData.email = this.normalizarEmail(dto.email);

    if (dto.senha) {
      usuarioData.senhaHash = await bcrypt.hash(dto.senha, 10);
      usuarioData.deveRedefinirSenha = false;
    }

    return this.prisma.$transaction(async (tx) => {
      if (Object.keys(usuarioData).length > 0) {
        await tx.usuario.update({
          where: { id: vendedorAtual.usuarioId },
          data: usuarioData,
        });
      }

      return tx.vendedor.update({ where: { id }, data });
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.vendedor.update({
      where: { id },
      data: { status: StatusUsuario.INATIVO },
    });
  }

  // ─── PERFORMANCE DE VENDAS ────────────────────────────

  async performanceVendas(
    page = 1,
    limit = 20,
    filtros?: FiltroPerformanceDto,
  ) {
    this.logger.log('Consultando performance de vendas dos vendedores');

    const vendaWhere = this.buildVendaWhere(filtros);
    const comissaoWhere = this.buildComissaoWhere(filtros);
    const searchWhere: Prisma.VendedorWhereInput = filtros?.search
      ? {
          OR: [
            { nome: { contains: filtros.search, mode: 'insensitive' } },
            { cpf: { contains: filtros.search } },
            { email: { contains: filtros.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const pagination = normalizePagination(page, limit);

    const vendedores = await this.prisma.vendedor.findMany({
      where: searchWhere,
      select: {
        id: true,
        codigo: true,
        nome: true,
        tipoChavePix: true,
        chavePix: true,
        distribuidor: {
          select: { id: true, nome: true },
        },
        vendas: {
          where: { ...vendaWhere, status: StatusVenda.APROVADO },
          select: {
            quantidade: true,
            tipoCartela: true,
            total: true,
          },
        },
        comissoes: {
          where: comissaoWhere,
          select: {
            valor: true,
          },
        },
      },
      orderBy: { nome: 'asc' },
    });

    // Agregar dados
    const performance = vendedores.map((v) => ({
      id: v.id,
      codigo: v.codigo,
      nome: v.nome,
      distribuidorNome: v.distribuidor.nome,
      tipoChavePix: v.tipoChavePix,
      chavePix: v.chavePix,
      qtdCartelas: v.vendas.reduce(
        (sum: number, venda) =>
          sum +
          calcularQuantidadeCartelasDaVenda({
            quantidade: venda.quantidade,
            tipoCartela: venda.tipoCartela,
          }),
        0,
      ),
      totalVendas: v.vendas.reduce(
        (sum: number, venda) => sum + Number(venda.total),
        0,
      ),
      comissao: v.comissoes.reduce(
        (sum: number, c) => sum + Number(c.valor),
        0,
      ),
    }));

    // Ordenar por totalVendas desc
    performance.sort((a, b) => b.totalVendas - a.totalVendas);

    // Top 10 (para gráfico)
    const top10 = performance.slice(0, 10).map((item) => ({
      id: item.id,
      nome: item.nome,
      totalVendas: item.totalVendas,
    }));

    // Paginar
    const total = performance.length;
    const paginatedData = performance.slice(
      pagination.skip,
      pagination.skip + pagination.limit,
    );

    return {
      message:
        paginatedData.length > 0
          ? 'Performance de vendedores consultada com sucesso'
          : 'Nenhum vendedor encontrado',
      top10,
      data: paginatedData,
      meta: {
        total,
        page: pagination.page,
        limit: pagination.limit,
        lastPage: total > 0 ? Math.ceil(total / pagination.limit) : 0,
      },
    };
  }

  // ─── HELPERS PRIVADOS ─────────────────────────────────

  private buildVendaWhere(
    filtros?: FiltroPerformanceDto,
  ): Prisma.VendaWhereInput {
    const where: Prisma.VendaWhereInput = {};
    if (!filtros) return where;

    if (filtros.edicaoId) where.edicaoId = filtros.edicaoId;

    if (filtros.dataInicio || filtros.dataFim) {
      where.createdAt = {};
      if (filtros.dataInicio) {
        where.createdAt.gte = new Date(filtros.dataInicio);
      }
      if (filtros.dataFim) {
        const dataFim = new Date(filtros.dataFim);
        dataFim.setHours(23, 59, 59, 999);
        where.createdAt.lte = dataFim;
      }
    }

    return where;
  }

  private buildComissaoWhere(
    filtros?: FiltroPerformanceDto,
  ): Prisma.ComissaoWhereInput {
    if (!filtros?.dataInicio && !filtros?.dataFim) return {};

    const where: Prisma.ComissaoWhereInput = {};
    where.createdAt = {};

    if (filtros.dataInicio) {
      where.createdAt.gte = new Date(filtros.dataInicio);
    }
    if (filtros.dataFim) {
      const dataFim = new Date(filtros.dataFim);
      dataFim.setHours(23, 59, 59, 999);
      where.createdAt.lte = dataFim;
    }

    return where;
  }
}
