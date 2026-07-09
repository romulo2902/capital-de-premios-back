import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { AtualizarMeusDadosDto } from './dto/meus-dados.dto';
import { Prisma, StatusUsuario } from '@prisma/client';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';
import { parseEValidarDataNascimento } from '../../common/utils/data-nascimento.util';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

type ClienteMeusDados = {
  id: string;
  nome: string;
  cpf: string;
  email: string | null;
  telefone: string;
  dataNascimento: Date | null;
};

type MeusDadosClienteResponse = {
  id: string;
  nome: string;
  cpf: string;
  cpfMascarado: string;
  email: string | null;
  emailMascarado: string | null;
  telefone: string;
  telefoneMascarado: string;
  dataNascimento: string | null;
  dataNascimentoMascarada: string | null;
};

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

  private buildHierarchyWhere(user?: RequestUser): Prisma.ClienteWhereInput {
    if (!user || user.perfil === 'ADMIN') {
      return {};
    }

    if (user.perfil === 'DISTRIBUIDOR') {
      if (!user.distribuidorId) {
        throw new ForbiddenException(
          'Usuário distribuidor sem vínculo válido para consultar clientes',
        );
      }

      return { distribuidorId: user.distribuidorId };
    }

    if (user.perfil === 'VENDEDOR') {
      if (!user.vendedorId) {
        throw new ForbiddenException(
          'Usuário vendedor sem vínculo válido para consultar clientes',
        );
      }

      return { vendedorId: user.vendedorId };
    }

    return {};
  }

  private mergeWhere(
    baseWhere: Prisma.ClienteWhereInput,
    scopeWhere: Prisma.ClienteWhereInput,
  ): Prisma.ClienteWhereInput {
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

  private formatarCpf(cpf: string): string {
    const cpfLimpo = cpf.replace(/\D/g, '');

    if (cpfLimpo.length !== 11) {
      return cpf;
    }

    return `${cpfLimpo.slice(0, 3)}.${cpfLimpo.slice(3, 6)}.${cpfLimpo.slice(6, 9)}-${cpfLimpo.slice(9, 11)}`;
  }

  private mascararCpf(cpf: string): string {
    const cpfLimpo = cpf.replace(/\D/g, '');

    if (cpfLimpo.length !== 11) {
      return cpf;
    }

    return `${cpfLimpo.slice(0, 3)}.***.***-${cpfLimpo.slice(9, 11)}`;
  }

  private mascararEmail(email: string | null): string | null {
    if (!email) {
      return null;
    }

    const [localPart, domain] = email.split('@');

    if (!localPart || !domain) {
      return email;
    }

    const visiblePart = localPart.slice(0, Math.min(3, localPart.length));
    return `${visiblePart}***@${domain}`;
  }

  private mascararTelefone(telefone: string): string {
    const telefoneLimpo = telefone.replace(/\D/g, '');

    if (telefoneLimpo.length < 6) {
      return telefone;
    }

    const ddd = telefoneLimpo.slice(0, 2);
    const final = telefoneLimpo.slice(-4);
    const prefixoMascarado = telefoneLimpo.length === 11 ? '*****' : '****';

    return `(${ddd}) ${prefixoMascarado}-${final}`;
  }

  private mascararDataNascimento(dataNascimento: Date | null): string | null {
    if (!dataNascimento) {
      return null;
    }

    return `${dataNascimento.toISOString().slice(0, 4)}-**-**`;
  }

  private toMeusDadosCliente(
    cliente: ClienteMeusDados,
  ): MeusDadosClienteResponse {
    const cpfMascarado = this.mascararCpf(cliente.cpf);
    const emailMascarado = this.mascararEmail(cliente.email);
    const telefoneMascarado = this.mascararTelefone(cliente.telefone);
    const dataNascimentoMascarada = this.mascararDataNascimento(
      cliente.dataNascimento,
    );

    return {
      id: cliente.id,
      nome: cliente.nome,
      cpf: cpfMascarado,
      cpfMascarado,
      email: emailMascarado,
      emailMascarado,
      telefone: telefoneMascarado,
      telefoneMascarado,
      dataNascimento: dataNascimentoMascarada,
      dataNascimentoMascarada,
    };
  }

  private async validateRelacionamentos(
    vendedorId: string | null | undefined,
    distribuidorId: string | null | undefined,
  ): Promise<void> {
    if (vendedorId) {
      const vendedor = await this.prisma.vendedor.findUnique({
        where: { id: vendedorId },
        select: { id: true, distribuidorId: true },
      });
      if (!vendedor) {
        throw new NotFoundException('Vendedor não encontrado');
      }

      if (distribuidorId && vendedor.distribuidorId !== distribuidorId) {
        throw new ConflictException(
          'O vendedor informado não pertence ao distribuidor informado',
        );
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

  private async resolverRelacionamentosParaCriacao(
    vendedorIdInformado: string | null | undefined,
    distribuidorIdInformado: string | null | undefined,
    user: RequestUser,
  ): Promise<{ vendedorId: string | null; distribuidorId: string | null }> {
    const vendedorId = this.normalizeRelationId(vendedorIdInformado);
    const distribuidorId = this.normalizeRelationId(distribuidorIdInformado);

    const vendedor = vendedorId
      ? await this.prisma.vendedor.findUnique({
          where: { id: vendedorId },
          select: { id: true, distribuidorId: true },
        })
      : null;

    if (vendedorId && !vendedor) {
      throw new NotFoundException('Vendedor não encontrado');
    }

    if (distribuidorId) {
      const distribuidor = await this.prisma.distribuidor.findUnique({
        where: { id: distribuidorId },
        select: { id: true },
      });
      if (!distribuidor) {
        throw new NotFoundException('Distribuidor não encontrado');
      }
    }

    if (
      vendedor &&
      distribuidorId &&
      vendedor.distribuidorId !== distribuidorId
    ) {
      throw new ConflictException(
        'O vendedor informado não pertence ao distribuidor informado',
      );
    }

    if (user.perfil === 'VENDEDOR') {
      if (!user.vendedorId) {
        throw new ForbiddenException(
          'Usuário vendedor sem vínculo válido para cadastrar cliente',
        );
      }

      const vendedorLogado = await this.prisma.vendedor.findUnique({
        where: { id: user.vendedorId },
        select: { id: true, distribuidorId: true },
      });

      if (!vendedorLogado) {
        throw new NotFoundException('Vendedor não encontrado');
      }

      if (vendedor && vendedor.id !== vendedorLogado.id) {
        throw new ForbiddenException(
          'Vendedor só pode cadastrar cliente para si mesmo',
        );
      }

      if (distribuidorId && distribuidorId !== vendedorLogado.distribuidorId) {
        throw new ForbiddenException(
          'Vendedor só pode cadastrar cliente para seu distribuidor',
        );
      }

      return {
        vendedorId: vendedorLogado.id,
        distribuidorId: vendedorLogado.distribuidorId,
      };
    }

    if (user.perfil === 'DISTRIBUIDOR') {
      if (!user.distribuidorId) {
        throw new ForbiddenException(
          'Usuário distribuidor sem vínculo válido para cadastrar cliente',
        );
      }

      if (distribuidorId && distribuidorId !== user.distribuidorId) {
        throw new ForbiddenException(
          'Distribuidor só pode cadastrar cliente para sua própria rede',
        );
      }

      if (vendedor && vendedor.distribuidorId !== user.distribuidorId) {
        throw new ForbiddenException(
          'Vendedor não pertence ao distribuidor autenticado',
        );
      }

      return {
        vendedorId: vendedor?.id ?? null,
        distribuidorId: user.distribuidorId,
      };
    }

    return {
      vendedorId: vendedor?.id ?? null,
      distribuidorId: distribuidorId ?? vendedor?.distribuidorId ?? null,
    };
  }

  async create(dto: CreateClienteDto, user: RequestUser) {
    const existing = await this.prisma.cliente.findUnique({
      where: { cpf: dto.cpf },
    });
    if (existing) throw new ConflictException('CPF já cadastrado');
    if (!dto.dataNascimento) {
      throw new BadRequestException('Data de nascimento é obrigatória');
    }

    const { vendedorId, distribuidorId } =
      await this.resolverRelacionamentosParaCriacao(
        dto.vendedorId,
        dto.distribuidorId,
        user,
      );

    const data: Prisma.ClienteUncheckedCreateInput = {
      ...(dto.codigo ? { codigo: dto.codigo } : {}),
      cpf: dto.cpf,
      nome: dto.nome,
      telefone: dto.telefone,
      dataNascimento: parseEValidarDataNascimento(dto.dataNascimento),
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
    user?: RequestUser,
  ) {
    const pagination = normalizePagination(page, limit);
    const filtersWhere: Prisma.ClienteWhereInput = {};

    if (vendedorId) filtersWhere.vendedorId = vendedorId;
    if (distribuidorId) filtersWhere.distribuidorId = distribuidorId;
    if (search) {
      filtersWhere.OR = [
        { nome: { contains: search, mode: 'insensitive' } },
        { cpf: { contains: search } },
        { telefone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const where = this.mergeWhere(filtersWhere, this.buildHierarchyWhere(user));

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

  async findOne(id: string, user?: RequestUser) {
    const cliente = await this.prisma.cliente.findFirst({
      where: this.mergeWhere({ id }, this.buildHierarchyWhere(user)),
      include: {
        vendedor: { select: { id: true, nome: true, codigo: true } },
        distribuidor: { select: { id: true, nome: true, codigo: true } },
        _count: { select: { vendas: true } },
      },
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    return cliente;
  }

  async findByCpf(cpf: string, user?: RequestUser) {
    const cliente = await this.prisma.cliente.findFirst({
      where: this.mergeWhere({ cpf }, this.buildHierarchyWhere(user)),
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    return cliente;
  }

  async findByCodigo(codigo: number, user?: RequestUser) {
    const cliente = await this.prisma.cliente.findFirst({
      where: this.mergeWhere({ codigo }, this.buildHierarchyWhere(user)),
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    return cliente;
  }

  async buscarMeusDados(
    cpf: string,
  ): Promise<{ message: string; data: { cliente: MeusDadosClienteResponse } }> {
    const cpfLimpo = cpf.replace(/\D/g, '');
    const cliente = await this.prisma.cliente.findFirst({
      where: {
        OR: [{ cpf: cpfLimpo }, { cpf: this.formatarCpf(cpfLimpo) }],
      },
      select: {
        id: true,
        nome: true,
        cpf: true,
        email: true,
        telefone: true,
        dataNascimento: true,
      },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente não encontrado');
    }

    return {
      message: 'Dados do cliente encontrados',
      data: { cliente: this.toMeusDadosCliente(cliente) },
    };
  }

  async atualizarMeusDados(
    id: string,
    dto: AtualizarMeusDadosDto,
  ): Promise<{ message: string; data: { cliente: MeusDadosClienteResponse } }> {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Informe ao menos um dado para atualizar');
    }

    const data: Prisma.ClienteUncheckedUpdateInput = {};

    if (dto.nome !== undefined) {
      data.nome = dto.nome.trim();
    }

    if (dto.telefone !== undefined) {
      data.telefone = dto.telefone.trim();
    }

    if (dto.email !== undefined) {
      data.email = dto.email === null ? null : dto.email.trim().toLowerCase();
    }

    if (dto.dataNascimento !== undefined) {
      data.dataNascimento = parseEValidarDataNascimento(dto.dataNascimento);
    }

    try {
      const cliente = await this.prisma.cliente.update({
        where: { id },
        data,
        select: {
          id: true,
          nome: true,
          cpf: true,
          email: true,
          telefone: true,
          dataNascimento: true,
        },
      });

      this.logger.log(`Cliente atualizou meus dados: ${cliente.id}`);

      return {
        message: 'Dados do cliente atualizados com sucesso',
        data: { cliente: this.toMeusDadosCliente(cliente) },
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Cliente não encontrado');
      }

      throw error;
    }
  }

  async update(id: string, dto: UpdateClienteDto, user?: RequestUser) {
    const clienteAtual = await this.findOne(id, user);

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
    if (dto.dataNascimento) {
      data.dataNascimento = parseEValidarDataNascimento(dto.dataNascimento);
    }

    if (vendedorId !== undefined || distribuidorId !== undefined) {
      const finalVendedorId =
        vendedorId !== undefined ? vendedorId : clienteAtual.vendedorId;
      const finalDistribuidorIdBase =
        distribuidorId !== undefined
          ? distribuidorId
          : clienteAtual.distribuidorId;

      let finalDistribuidorId = finalDistribuidorIdBase;

      if (finalVendedorId) {
        const vendedor = await this.prisma.vendedor.findUnique({
          where: { id: finalVendedorId },
          select: { id: true, distribuidorId: true },
        });

        if (!vendedor) {
          throw new NotFoundException('Vendedor não encontrado');
        }

        if (
          finalDistribuidorId &&
          vendedor.distribuidorId !== finalDistribuidorId
        ) {
          throw new ConflictException(
            'O vendedor informado não pertence ao distribuidor informado',
          );
        }

        finalDistribuidorId = vendedor.distribuidorId;
      }

      data.vendedorId = finalVendedorId ?? null;
      data.distribuidorId = finalDistribuidorId ?? null;
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
