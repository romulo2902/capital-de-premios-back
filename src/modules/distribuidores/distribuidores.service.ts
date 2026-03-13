import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDistribuidorDto } from './dto/create-distribuidor.dto';
import { UpdateDistribuidorDto } from './dto/update-distribuidor.dto';
import { Perfil, StatusUsuario } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class DistribuidoresService {
  private readonly logger = new Logger(DistribuidoresService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDistribuidorDto) {
    const existing = await this.prisma.distribuidor.findUnique({
      where: { cpf: dto.cpf },
    });
    if (existing) throw new ConflictException('CPF já cadastrado');

    const senhaHash = dto.senha
      ? await bcrypt.hash(dto.senha, 10)
      : await bcrypt.hash('Dist@123', 10);

    return this.prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          email: dto.email,
          cpf: dto.cpf,
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
          cpf: dto.cpf,
          telefone: dto.telefone,
          email: dto.email,
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
          link: dto.link,
          status: StatusUsuario.ATIVO,
        },
      });

      this.logger.log(
        `Distribuidor criado: ${distribuidor.nome} (${distribuidor.codigo})`,
      );
      return distribuidor;
    });
  }

  async findAll(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? {
          OR: [
            { nome: { contains: search, mode: 'insensitive' as const } },
            { documento: { contains: search } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.distribuidor.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { vendedores: true } } },
      }),
      this.prisma.distribuidor.count({ where }),
    ]);

    return { data, total, page, limit };
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
    await this.findOne(id);

    if (dto.cpf) {
      const conflict = await this.prisma.distribuidor.findFirst({
        where: { cpf: dto.cpf, NOT: { id } },
      });
      if (conflict) throw new ConflictException('CPF já cadastrado');
    }

    const data: Record<string, unknown> = { ...dto };
    delete data.senha;
    delete data.codigo;
    if (dto.dataNascimento) data.dataNascimento = new Date(dto.dataNascimento);

    if (dto.senha) {
      const distribuidor = await this.prisma.distribuidor.findUnique({
        where: { id },
      });
      await this.prisma.usuario.update({
        where: { id: distribuidor!.usuarioId },
        data: {
          senhaHash: await bcrypt.hash(dto.senha, 10),
          deveRedefinirSenha: false,
        },
      });
    }

    return this.prisma.distribuidor.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.distribuidor.update({
      where: { id },
      data: { status: StatusUsuario.INATIVO },
    });
  }
}
