import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { Prisma, StatusUsuario } from '@prisma/client';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';

@Injectable()
export class ClientesService {
  private readonly logger = new Logger(ClientesService.name);

  constructor(private readonly prisma: PrismaService) {}

  private normalizeRelationId(
    value: string | null | undefined,
  ): string | null | undefined {
    if (value === undefined || value === null) {
      return value;
    }

    const normalizedValue = value.trim();
    return normalizedValue === '' ? null : normalizedValue;
  }

  private async validateRelacionamentos(
    vendedorId: string | null | undefined,
    distribuidorId: string | null | undefined,
  ): Promise<void> {
    if (vendedorId && distribuidorId) {
      throw new ConflictException(
        'Informe apenas vendedorId ou distribuidorId',
      );
    }

    if (vendedorId) {
      const vendedor = await this.prisma.vendedor.findUnique({
        where: { id: vendedorId },
      });
      if (!vendedor) {
        throw new NotFoundException('Vendedor não encontrado');
      }
    }

    if (distribuidorId) {
      const distribuidor = await this.prisma.distribuidor.findUnique({
        where: { id: distribuidorId },
      });
      if (!distribuidor) {
        throw new NotFoundException('Distribuidor não encontrado');
      }
    }
  }

  async create(dto: CreateClienteDto) {
    const existing = await this.prisma.cliente.findUnique({
      where: { cpf: dto.cpf },
    });
    if (existing) throw new ConflictException('CPF já cadastrado');

    const vendedorId = this.normalizeRelationId(dto.vendedorId);
    const distribuidorId = this.normalizeRelationId(dto.distribuidorId);

    await this.validateRelacionamentos(vendedorId, distribuidorId);

    const data: Prisma.ClienteUncheckedCreateInput = {
      ...(dto.codigo ? { codigo: dto.codigo } : {}),
      cpf: dto.cpf,
      nome: dto.nome,
      telefone: dto.telefone,
      dataNascimento: dto.dataNascimento
        ? new Date(dto.dataNascimento)
        : undefined,
      cep: dto.cep,
      endereco: dto.endereco,
      numero: dto.numero,
      bairro: dto.bairro,
      cidade: dto.cidade,
      estado: dto.estado,
      email: dto.email,
      vendedorId: vendedorId ?? null,
      distribuidorId: distribuidorId ?? null,
      status: StatusUsuario.ATIVO,
    };

    const cliente = await this.prisma.cliente.create({
      data,
      include: {
        vendedor: { select: { id: true, nome: true, codigo: true } },
        distribuidor: { select: { id: true, nome: true, codigo: true } },
      },
    });

    this.logger.log(`Cliente criado: ${cliente.nome} (${cliente.codigo})`);
    return cliente;
  }

  async findAll(
    page = 1,
    limit = 20,
    search?: string,
    vendedorId?: string,
    distribuidorId?: string,
  ) {
    const pagination = normalizePagination(page, limit);
    const where: Record<string, unknown> = {};

    if (vendedorId) where.vendedorId = vendedorId;
    if (distribuidorId) where.distribuidorId = distribuidorId;
    if (search) {
      where.OR = [
        { nome: { contains: search, mode: 'insensitive' } },
        { cpf: { contains: search } },
        { telefone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.cliente.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          vendedor: { select: { id: true, nome: true, codigo: true } },
          distribuidor: { select: { id: true, nome: true, codigo: true } },
        },
      }),
      this.prisma.cliente.count({ where }),
    ]);

    return buildPaginatedResponse(
      data,
      total,
      pagination.page,
      pagination.limit,
      {
        successMessage: 'Clientes listados com sucesso',
        emptyMessage: 'Nenhum cliente encontrado',
      },
    );
  }

  async findOne(id: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
      include: {
        vendedor: { select: { id: true, nome: true, codigo: true } },
        distribuidor: { select: { id: true, nome: true, codigo: true } },
        _count: { select: { vendas: true } },
      },
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    return cliente;
  }

  async findByCpf(cpf: string) {
    const cliente = await this.prisma.cliente.findUnique({ where: { cpf } });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    return cliente;
  }

  async findByCodigo(codigo: number) {
    const cliente = await this.prisma.cliente.findUnique({ where: { codigo } });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    return cliente;
  }

  async update(id: string, dto: UpdateClienteDto) {
    await this.findOne(id);

    if (dto.cpf) {
      const conflict = await this.prisma.cliente.findFirst({
        where: { cpf: dto.cpf, NOT: { id } },
      });
      if (conflict) throw new ConflictException('CPF já cadastrado');
    }

    const vendedorId = this.normalizeRelationId(dto.vendedorId);
    const distribuidorId = this.normalizeRelationId(dto.distribuidorId);

    await this.validateRelacionamentos(vendedorId, distribuidorId);

    const data: Prisma.ClienteUncheckedUpdateInput = { ...dto };
    delete data.codigo;
    if (dto.dataNascimento) data.dataNascimento = new Date(dto.dataNascimento);
    if (vendedorId !== undefined) {
      data.vendedorId = vendedorId;
      if (vendedorId) {
        data.distribuidorId = null;
      }
    }
    if (distribuidorId !== undefined) {
      data.distribuidorId = distribuidorId;
      if (distribuidorId) {
        data.vendedorId = null;
      }
    }

    return this.prisma.cliente.update({
      where: { id },
      data,
      include: {
        vendedor: { select: { id: true, nome: true, codigo: true } },
        distribuidor: { select: { id: true, nome: true, codigo: true } },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.cliente.update({
      where: { id },
      data: { status: StatusUsuario.INATIVO },
    });
  }
}
