import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Perfil, Prisma, StatusUsuario, StatusVenda } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { QrcodeService } from '../qrcode/qrcode.service';
import { CreateDistribuidorDto } from './dto/create-distribuidor.dto';
import { UpdateDistribuidorDto } from './dto/update-distribuidor.dto';
import { FiltroPerformanceDto } from './dto/filtro-performance.dto';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';
import { calcularQuantidadeCartelasDaVenda } from '../vendas/vendas-quantidade.util';

@Injectable()
export class DistribuidoresService {
  private readonly logger = new Logger(DistribuidoresService.name);

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

  private async validarCpfDisponivel(
    cpf: string,
    distribuidorId?: string,
    usuarioId?: string,
  ): Promise<void> {
    const [distribuidorExistente, usuarioExistente] = await Promise.all([
      this.prisma.distribuidor.findFirst({
        where: {
          cpf,
          ...(distribuidorId ? { NOT: { id: distribuidorId } } : {}),
        },
      }),
      this.prisma.usuario.findFirst({
        where: {
          cpf,
          ...(usuarioId ? { NOT: { id: usuarioId } } : {}),
        },
      }),
    ]);

    if (distribuidorExistente || usuarioExistente) {
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

  async create(dto: CreateDistribuidorDto) {
    const cpf = this.normalizarCpf(dto.cpf);
    const email = this.normalizarEmail(dto.email);

    await Promise.all([
      this.validarCpfDisponivel(cpf),
      this.validarEmailDisponivel(email),
    ]);

    const senhaHash = dto.senha
      ? await bcrypt.hash(dto.senha, 10)
      : await bcrypt.hash(this.gerarSenhaPadraoPorCpf(cpf), 10);

    return this.prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          email,
          cpf,
          senhaHash,
          perfil: Perfil.DISTRIBUIDOR,
          deveRedefinirSenha: false,
          status: StatusUsuario.ATIVO,
        },
      });

      const distribuidor = await tx.distribuidor.create({
        data: {
          ...(dto.codigo ? { codigo: dto.codigo } : {}),
          usuarioId: usuario.id,
          nome: dto.nome,
          cpf,
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
          comissaoPercent: dto.comissaoPercent !== undefined ? dto.comissaoPercent : 0,
          link: dto.link,
          status: StatusUsuario.ATIVO,
        },
      });

      this.logger.log(
        `Distribuidor criado: ${distribuidor.nome} (${distribuidor.codigo})`,
      );
      return distribuidor;
    }).then(async (distribuidor) => {
      try {
        await this.qrcodeService.gerarQrcodeDistribuidor(distribuidor.id);
      } catch (err) {
        this.logger.warn(
          `Falha ao gerar QR Code para distribuidor ${distribuidor.id}: ${(err as Error).message}`,
        );
      }
      return distribuidor;
    });
  }

  async findAll(page = 1, limit = 20, search?: string) {
    const pagination = normalizePagination(page, limit);
    const where = search
      ? {
          OR: [
            { nome: { contains: search, mode: 'insensitive' as const } },
            { cpf: { contains: search } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.distribuidor.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { vendedores: true } } },
      }),
      this.prisma.distribuidor.count({ where }),
    ]);

    return buildPaginatedResponse(
      data,
      total,
      pagination.page,
      pagination.limit,
      {
        successMessage: 'Distribuidores listados com sucesso',
        emptyMessage: 'Nenhum distribuidor encontrado',
      },
    );
  }

  async findOne(id: string) {
    const distribuidor = await this.prisma.distribuidor.findUnique({
      where: { id },
      include: {
        _count: { select: { vendedores: true } },
        vendedores: {
          select: { id: true, nome: true, codigo: true, status: true },
        },
      },
    });
    if (!distribuidor)
      throw new NotFoundException('Distribuidor não encontrado');
    return distribuidor;
  }

  async findByCodigo(codigo: number) {
    const distribuidor = await this.prisma.distribuidor.findUnique({
      where: { codigo },
    });
    if (!distribuidor)
      throw new NotFoundException('Distribuidor não encontrado');
    return distribuidor;
  }

  async update(id: string, dto: UpdateDistribuidorDto) {
    const distribuidorAtual = await this.prisma.distribuidor.findUnique({
      where: { id },
      select: { id: true, usuarioId: true },
    });

    if (!distribuidorAtual) {
      throw new NotFoundException('Distribuidor não encontrado');
    }

    if (dto.cpf) {
      await this.validarCpfDisponivel(
        this.normalizarCpf(dto.cpf),
        id,
        distribuidorAtual.usuarioId,
      );
    }

    if (dto.email) {
      await this.validarEmailDisponivel(
        this.normalizarEmail(dto.email),
        distribuidorAtual.usuarioId,
      );
    }

    const data: Record<string, unknown> = { ...dto };
    delete data.senha;
    delete data.codigo;
    if (dto.cpf) data.cpf = this.normalizarCpf(dto.cpf);
    if (dto.email) data.email = this.normalizarEmail(dto.email);
    if (dto.dataNascimento) data.dataNascimento = new Date(dto.dataNascimento);
    if (dto.link !== undefined) data.qrcode = null;

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
          where: { id: distribuidorAtual.usuarioId },
          data: usuarioData,
        });
      }

      return tx.distribuidor.update({ where: { id }, data });
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.distribuidor.update({
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
    this.logger.log('Consultando performance de vendas dos distribuidores');

    const vendaWhere = this.buildVendaWhere(filtros);
    const comissaoWhere = this.buildComissaoWhere(filtros);
    const searchWhere: Prisma.DistribuidorWhereInput = filtros?.search
      ? {
          OR: [
            { nome: { contains: filtros.search, mode: 'insensitive' } },
            { cpf: { contains: filtros.search } },
            { email: { contains: filtros.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const pagination = normalizePagination(page, limit);

    const distribuidores = await this.prisma.distribuidor.findMany({
      where: searchWhere,
      select: {
        id: true,
        codigo: true,
        nome: true,
        tipoChavePix: true,
        chavePix: true,
        vendedores: {
          select: {
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
        },
      },
      orderBy: { nome: 'asc' },
    });

    // Agregar dados (somar vendas de todos os vendedores do distribuidor)
    const performance = distribuidores.map((d) => {
      let qtdCartelas = 0;
      let totalVendas = 0;
      let comissao = 0;

      for (const vendedor of d.vendedores) {
        for (const venda of vendedor.vendas) {
          qtdCartelas += calcularQuantidadeCartelasDaVenda({
            quantidade: venda.quantidade,
            tipoCartela: venda.tipoCartela,
          });
          totalVendas += Number(venda.total);
        }
        for (const c of vendedor.comissoes) {
          comissao += Number(c.valor);
        }
      }

      return {
        id: d.id,
        codigo: d.codigo,
        nome: d.nome,
        tipoChavePix: d.tipoChavePix,
        chavePix: d.chavePix,
        qtdCartelas,
        totalVendas,
        comissao,
      };
    });

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
          ? 'Performance de distribuidores consultada com sucesso'
          : 'Nenhum distribuidor encontrado',
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
