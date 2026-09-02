import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatusMaquininha } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { CreateMaquininhaDto } from './dto/create-maquininha.dto';
import { UpdateMaquininhaDto } from './dto/update-maquininha.dto';
import { FiltroMaquininhasDto } from './dto/filtro-maquininhas.dto';

const MAQUININHA_SELECT = {
  id: true,
  numeroSerie: true,
  apelido: true,
  operadora: true,
  status: true,
  limiteCredito: true,
  saldoCredito: true,
  distribuidorId: true,
  vendedorId: true,
  createdAt: true,
  distribuidor: { select: { id: true, nome: true, codigo: true } },
  vendedor: { select: { id: true, nome: true, codigo: true } },
} satisfies Prisma.MaquininhaSelect;

/**
 * Maquininhas de cartão da rede.
 *
 * O aparelho pertence a um distribuidor e opera com no máximo um vendedor —
 * `vendedorId` nulo significa "no estoque do distribuidor". Todo método recebe
 * o `RequestUser` e deriva o recorte dele: este service nunca aceita
 * `distribuidorId` do corpo vindo de um distribuidor.
 */
@Injectable()
export class MaquininhasService {
  private readonly logger = new Logger(MaquininhasService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Série é comparada sempre normalizada: sem espaços e em caixa alta. */
  private normalizarSerie(numeroSerie: string): string {
    return numeroSerie.trim().toUpperCase();
  }

  /**
   * Define em qual rede a maquininha entra.
   *
   * DISTRIBUIDOR nunca escolhe — vem do token, e o corpo é ignorado. ADMIN
   * escolhe livremente, mas precisa informar.
   */
  private resolverDistribuidorAlvo(
    distribuidorIdDto: string | undefined,
    user: RequestUser,
  ): string {
    if (user.perfil === 'DISTRIBUIDOR') {
      if (!user.distribuidorId) {
        throw new ForbiddenException(
          'Operador distribuidor sem vínculo válido para gerenciar maquininhas',
        );
      }
      return user.distribuidorId;
    }

    if (user.perfil === 'ADMIN') {
      if (!distribuidorIdDto) {
        throw new BadRequestException(
          'distribuidorId é obrigatório para o perfil ADMIN',
        );
      }
      return distribuidorIdDto;
    }

    throw new ForbiddenException(
      'Perfil sem permissão para cadastrar maquininhas',
    );
  }

  /**
   * O vendedor precisa ser da mesma rede da maquininha.
   *
   * Sem isso bastaria mandar o UUID de um vendedor de outra rede no corpo para
   * entregar o aparelho para fora da própria operação.
   */
  private async garantirVendedorDaRede(
    vendedorId: string,
    distribuidorId: string,
  ): Promise<void> {
    const vendedor = await this.prisma.vendedor.findFirst({
      where: { id: vendedorId, distribuidorId },
      select: { id: true },
    });

    if (!vendedor) {
      throw new BadRequestException(
        'Vendedor não pertence à rede desta maquininha',
      );
    }
  }

  async create(dto: CreateMaquininhaDto, user: RequestUser) {
    const distribuidorId = this.resolverDistribuidorAlvo(
      dto.distribuidorId,
      user,
    );
    const numeroSerie = this.normalizarSerie(dto.numeroSerie);

    const jaCadastrada = await this.prisma.maquininha.findUnique({
      where: { numeroSerie },
      select: { id: true },
    });
    if (jaCadastrada) {
      throw new ConflictException('Número de série já cadastrado');
    }

    if (dto.vendedorId) {
      await this.garantirVendedorDaRede(dto.vendedorId, distribuidorId);
    }

    const maquininha = await this.prisma.maquininha.create({
      data: {
        distribuidorId,
        vendedorId: dto.vendedorId ?? null,
        numeroSerie,
        apelido: dto.apelido,
        operadora: dto.operadora,
      },
      select: MAQUININHA_SELECT,
    });

    this.logger.log(
      `Maquininha cadastrada: ${maquininha.numeroSerie} → dist ${distribuidorId}`,
    );

    return { message: 'Maquininha cadastrada com sucesso', data: maquininha };
  }

  async findAll(filtros: FiltroMaquininhasDto, user: RequestUser) {
    const pagination = normalizePagination(filtros.page, filtros.limit);
    const where: Prisma.MaquininhaWhereInput = this.buildEscopoDoOperador(user);

    if (filtros.status) where.status = filtros.status;
    // Filtro por rede só faz sentido para o ADMIN: para os demais o escopo do
    // token já fixou a rede, e aceitar o parâmetro só criaria confusão.
    if (filtros.distribuidorId && user.perfil === 'ADMIN') {
      where.distribuidorId = filtros.distribuidorId;
    }
    if (filtros.search) {
      where.OR = [
        { numeroSerie: { contains: filtros.search, mode: 'insensitive' } },
        { apelido: { contains: filtros.search, mode: 'insensitive' } },
        { operadora: { contains: filtros.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.maquininha.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        select: MAQUININHA_SELECT,
      }),
      this.prisma.maquininha.count({ where }),
    ]);

    return buildPaginatedResponse(
      data,
      total,
      pagination.page,
      pagination.limit,
      {
        successMessage: 'Maquininhas listadas com sucesso',
        emptyMessage: 'Nenhuma maquininha encontrada',
      },
    );
  }

  async findOne(id: string, user: RequestUser) {
    const maquininha = await this.prisma.maquininha.findFirst({
      where: { ...this.buildEscopoDoOperador(user), id },
      select: MAQUININHA_SELECT,
    });

    if (!maquininha) {
      throw new NotFoundException('Maquininha não encontrada');
    }

    return { message: 'Maquininha encontrada', data: maquininha };
  }

  async update(id: string, dto: UpdateMaquininhaDto, user: RequestUser) {
    const atual = await this.prisma.maquininha.findFirst({
      where: { ...this.buildEscopoDoOperador(user), id },
      select: { id: true, distribuidorId: true },
    });
    if (!atual) {
      throw new NotFoundException('Maquininha não encontrada');
    }

    // Transferir aparelho entre redes é privilégio do ADMIN.
    const distribuidorId =
      user.perfil === 'ADMIN' && dto.distribuidorId
        ? dto.distribuidorId
        : atual.distribuidorId;
    const mudouDeRede = distribuidorId !== atual.distribuidorId;

    if (dto.numeroSerie) {
      const numeroSerie = this.normalizarSerie(dto.numeroSerie);
      const conflito = await this.prisma.maquininha.findFirst({
        where: { numeroSerie, NOT: { id } },
        select: { id: true },
      });
      if (conflito) {
        throw new ConflictException('Número de série já cadastrado');
      }
    }

    if (dto.vendedorId) {
      await this.garantirVendedorDaRede(dto.vendedorId, distribuidorId);
    }

    const maquininha = await this.prisma.maquininha.update({
      where: { id },
      data: {
        ...(dto.numeroSerie
          ? { numeroSerie: this.normalizarSerie(dto.numeroSerie) }
          : {}),
        ...(dto.apelido !== undefined ? { apelido: dto.apelido } : {}),
        ...(dto.operadora !== undefined ? { operadora: dto.operadora } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(mudouDeRede ? { distribuidorId } : {}),
        // `vendedorId: null` no corpo devolve o aparelho para o estoque; campo
        // ausente mantém o vínculo atual.
        //
        // Exceção: trocar de rede solta o vendedor. Ele é da rede antiga, e
        // manter o vínculo deixaria um aparelho de uma rede operado por
        // vendedor de outra — que é justamente o isolamento que o escopo do
        // POS depende. Informar um vendedor novo (já validado acima) sobrepõe.
        ...(dto.vendedorId !== undefined
          ? { vendedorId: dto.vendedorId ?? null }
          : mudouDeRede
            ? { vendedorId: null }
            : {}),
      },
      select: MAQUININHA_SELECT,
    });

    this.logger.log(`Maquininha atualizada: ${maquininha.numeroSerie}`);

    return { message: 'Maquininha atualizada com sucesso', data: maquininha };
  }

  /**
   * Confirma que o aparelho está ao alcance do operador e devolve o id.
   *
   * Diferente do `garantirMaquininhaDoOperador`, não exige status ATIVA: é
   * usado para leitura (extrato de crédito), e o histórico de um aparelho
   * inativado continua consultável. Mesma política de 404 para o que está
   * fora do escopo.
   */
  async garantirAcessoAoAparelho(
    maquininhaId: string,
    user: RequestUser,
  ): Promise<string> {
    const maquininha = await this.prisma.maquininha.findFirst({
      where: { ...this.buildEscopoDoOperador(user), id: maquininhaId },
      select: { id: true },
    });

    if (!maquininha) {
      throw new NotFoundException('Maquininha não encontrada');
    }

    return maquininha.id;
  }

  /**
   * Resolve a maquininha que o operador pode usar numa venda do POS.
   *
   * Um 404 cobre tanto "não existe" quanto "não é sua": responder diferente
   * entregaria a existência de aparelho de outra rede a quem chutar UUID.
   */
  async garantirMaquininhaDoOperador(
    maquininhaId: string,
    user: RequestUser,
  ): Promise<string> {
    const maquininha = await this.prisma.maquininha.findFirst({
      where: {
        ...this.buildEscopoDoOperador(user),
        id: maquininhaId,
        status: StatusMaquininha.ATIVA,
      },
      select: { id: true },
    });

    if (!maquininha) {
      throw new NotFoundException(
        'Maquininha não encontrada, inativa ou não vinculada a este operador',
      );
    }

    return maquininha.id;
  }

  /**
   * Valida a maquininha pelo número de série impresso no aparelho.
   *
   * O terminal não conhece o UUID interno, só a série física — é o caso de
   * uso de quem digita ou lê o aparelho na hora de vender. Mesma regra de
   * escopo e status do `garantirMaquininhaDoOperador`: aparelho fora do
   * alcance ou inativo responde 404, nunca 403, para não entregar a
   * existência de equipamento de outra rede a quem tentar adivinhar a série.
   */
  async validarPorNumeroSerie(numeroSerie: string, user: RequestUser) {
    const maquininha = await this.prisma.maquininha.findFirst({
      where: {
        ...this.buildEscopoDoOperador(user),
        numeroSerie: this.normalizarSerie(numeroSerie),
        status: StatusMaquininha.ATIVA,
      },
      select: MAQUININHA_SELECT,
    });

    if (!maquininha) {
      throw new NotFoundException(
        'Maquininha não encontrada, inativa ou não vinculada a este operador',
      );
    }

    return { message: 'Maquininha validada com sucesso', data: maquininha };
  }

  private buildEscopoDoOperador(
    user: RequestUser,
  ): Prisma.MaquininhaWhereInput {
    if (user.perfil === 'ADMIN') {
      return {};
    }

    if (user.perfil === 'DISTRIBUIDOR') {
      if (!user.distribuidorId) {
        throw new ForbiddenException(
          'Operador distribuidor sem vínculo válido para acessar maquininhas',
        );
      }
      return { distribuidorId: user.distribuidorId };
    }

    if (user.perfil === 'VENDEDOR') {
      if (!user.vendedorId) {
        throw new ForbiddenException(
          'Operador vendedor sem vínculo válido para acessar maquininhas',
        );
      }
      return { vendedorId: user.vendedorId };
    }

    throw new ForbiddenException('Perfil sem acesso às maquininhas');
  }
}
