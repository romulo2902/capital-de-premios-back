import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { StatusUsuario } from '@prisma/client';

@Injectable()
export class ClientesService {
  private readonly logger = new Logger(ClientesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateClienteDto) {
    const existing = await this.prisma.cliente.findUnique({
      where: { cpf: dto.cpf },
    });
    if (existing) throw new ConflictException('CPF já cadastrado');

    if (dto.vendedorId && dto.distribuidorId) {
      throw new ConflictException(
        'Informe apenas vendedorId ou distribuidorId',
      );
    }

    if (dto.vendedorId) {
      const vendedor = await this.prisma.vendedor.findUnique({
        where: { id: dto.vendedorId },
      });
      if (!vendedor) throw new NotFoundException('Vendedor não encontrado');
    }
    if (dto.distribuidorId) {
      const distribuidor = await this.prisma.distribuidor.findUnique({
        where: { id: dto.distribuidorId },
      });
      if (!distribuidor)
        throw new NotFoundException('Distribuidor não encontrado');
    }

    const cliente = await this.prisma.cliente.create({
      data: {
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
        vendedorId: dto.vendedorId ?? null,
        distribuidorId: dto.distribuidorId ?? null,
        status: StatusUsuario.ATIVO,
      },
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
    const skip = (page - 1) * limit;
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
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          vendedor: { select: { id: true, nome: true, codigo: true } },
          distribuidor: { select: { id: true, nome: true, codigo: true } },
        },
      }),
      this.prisma.cliente.count({ where }),
    ]);

    return { data, total, page, limit };
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

    if (dto.vendedorId && dto.distribuidorId) {
      throw new ConflictException(
        'Informe apenas vendedorId ou distribuidorId',
      );
    }

    if (dto.vendedorId) {
      const vendedor = await this.prisma.vendedor.findUnique({
        where: { id: dto.vendedorId },
      });
      if (!vendedor) throw new NotFoundException('Vendedor não encontrado');
    }
    if (dto.distribuidorId) {
      const distribuidor = await this.prisma.distribuidor.findUnique({
        where: { id: dto.distribuidorId },
      });
      if (!distribuidor)
        throw new NotFoundException('Distribuidor não encontrado');
    }

    const data: Record<string, unknown> = { ...dto };
    delete data.codigo;
    if (dto.dataNascimento) data.dataNascimento = new Date(dto.dataNascimento);

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
