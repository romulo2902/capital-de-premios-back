import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVendedorDto } from './dto/create-vendedor.dto';
import { UpdateVendedorDto } from './dto/update-vendedor.dto';
import { Perfil, StatusUsuario } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class VendedoresService {
  private readonly logger = new Logger(VendedoresService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateVendedorDto) {
    const existing = await this.prisma.vendedor.findUnique({
      where: { cpf: dto.cpf },
    });
    if (existing) throw new ConflictException('CPF já cadastrado');

    const distribuidor = await this.prisma.distribuidor.findUnique({
      where: { id: dto.distribuidorId },
    });
    if (!distribuidor) throw new NotFoundException('Distribuidor não encontrado');

    const senhaHash = dto.senha ? await bcrypt.hash(dto.senha, 10) : await bcrypt.hash('Vend@123', 10);

    return this.prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          email: dto.email,
          cpf: dto.cpf,
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
          cpf: dto.cpf,
          nomeRecebedor: dto.nomeRecebedor ?? dto.nome,
          telefone: dto.telefone,
          email: dto.email,
          dataNascimento: dto.dataNascimento ? new Date(dto.dataNascimento) : undefined,
          cep: dto.cep,
          endereco: dto.endereco,
          numero: dto.numero,
          bairro: dto.bairro,
          cidade: dto.cidade,
          estado: dto.estado,
          tipoChavePix: dto.tipoChavePix,
          chavePix: dto.chavePix,
          link: dto.link,
          status: StatusUsuario.ATIVO,
        },
      });

      this.logger.log(`Vendedor criado: ${vendedor.nome} (${vendedor.codigo}) → dist ${distribuidor.codigo}`);
      return vendedor;
    });
  }

  async findAll(page = 1, limit = 20, search?: string, distribuidorId?: string) {
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};

    if (distribuidorId) where.distribuidorId = distribuidorId;
    if (search) {
      where.OR = [
        { nome: { contains: search, mode: 'insensitive' } },
        { documento: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.vendedor.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          distribuidor: { select: { id: true, nome: true, codigo: true } },
          _count: { select: { clientes: true, vendas: true } },
        },
      }),
      this.prisma.vendedor.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const vendedor = await this.prisma.vendedor.findUnique({
      where: { id },
      include: {
        distribuidor: { select: { id: true, nome: true, codigo: true } },
        _count: { select: { clientes: true, vendas: true } },
      },
    });
    if (!vendedor) throw new NotFoundException('Vendedor não encontrado');
    return vendedor;
  }

  async findByCodigo(codigo: number) {
    const vendedor = await this.prisma.vendedor.findUnique({ where: { codigo } });
    if (!vendedor) throw new NotFoundException('Vendedor não encontrado');
    return vendedor;
  }

  async update(id: string, dto: UpdateVendedorDto) {
    await this.findOne(id);

    if (dto.cpf) {
      const conflict = await this.prisma.vendedor.findFirst({
        where: { cpf: dto.cpf, NOT: { id } },
      });
      if (conflict) throw new ConflictException('CPF já cadastrado');
    }

    const data: Record<string, unknown> = { ...dto };
    delete data.senha;
    delete data.codigo;
    if (dto.dataNascimento) data.dataNascimento = new Date(dto.dataNascimento);

    if (dto.senha) {
      const vendedor = await this.prisma.vendedor.findUnique({ where: { id } });
      await this.prisma.usuario.update({
        where: { id: vendedor!.usuarioId },
        data: {
          senhaHash: await bcrypt.hash(dto.senha, 10),
          deveRedefinirSenha: false,
        },
      });
    }

    return this.prisma.vendedor.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.vendedor.update({
      where: { id },
      data: { status: StatusUsuario.INATIVO },
    });
  }
}
