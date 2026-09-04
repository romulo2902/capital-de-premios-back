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
import { CreditosMaquininhaService } from './creditos-maquininha.service';
import {
  CREDITO_INICIAL_MAQUININHA,
  LIMITE_CREDITO_MAXIMO,
} from './dto/atualizar-limite-credito.dto';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly creditosService: CreditosMaquininhaService,
  ) {}

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

    // A série é única GLOBAL, incluindo as excluídas: um aparelho físico existe
    // uma vez só, e reaproveitar a série de uma excluída daria dois históricos
    // de crédito ao mesmo aparelho. Por isso a mensagem separa os dois casos —
    // "já cadastrado" manda procurar na rede, "excluído" diz que não volta.
    const jaCadastrada = await this.prisma.maquininha.findUnique({
      where: { numeroSerie },
      select: { id: true, deletedAt: true },
    });
    if (jaCadastrada) {
      throw new ConflictException(
        jaCadastrada.deletedAt
          ? 'Número de série pertence a uma maquininha excluída e não pode ser recadastrado'
          : 'Número de série já cadastrado',
      );
    }

    if (dto.vendedorId) {
      await this.garantirVendedorDaRede(dto.vendedorId, distribuidorId);
    }

    // Aparelho entra operante com teto no máximo (R$ 5.000) e saldo de
    // abertura menor (R$ 2.000): já sai vendendo e ainda sobra espaço para o
    // ADMIN recarregar. Nascer com saldo igual ao teto travaria a recarga até
    // o vendedor gastar, e nascer só com teto o deixaria sem nada para gastar
    // — a primeira venda MANUAL morreria em "crédito insuficiente".
    //
    // O crédito vai pelo razão, no mesmo commit do cadastro — ou nascem os
    // dois, ou nenhum.
    const maquininha = await this.prisma.$transaction(async (tx) => {
      const criada = await tx.maquininha.create({
        data: {
          distribuidorId,
          vendedorId: dto.vendedorId ?? null,
          numeroSerie,
          apelido: dto.apelido,
          operadora: dto.operadora,
          limiteCredito: LIMITE_CREDITO_MAXIMO,
        },
        select: { id: true },
      });

      await this.creditosService.creditarAbertura(tx, {
        maquininhaId: criada.id,
        valor: CREDITO_INICIAL_MAQUININHA,
        criadoPorId: user.id,
      });

      return tx.maquininha.findUniqueOrThrow({
        where: { id: criada.id },
        select: MAQUININHA_SELECT,
      });
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
   * Exclusão lógica do aparelho — privilégio do ADMIN, garantido pelo `@Roles`.
   *
   * Não é `status: INATIVA`: inativa é aparelho fora de operação que segue na
   * frota e o distribuidor reativa; excluída sai da frota e some de toda
   * listagem, inclusive do seletor do POS.
   *
   * Nunca apaga a linha. `MovimentoCreditoMaquininha` aponta para ela com
   * ON DELETE RESTRICT, e o razão de crédito é a fonte da verdade do saldo —
   * um DELETE físico levaria o histórico junto.
   */
  async remove(id: string, user: RequestUser) {
    const maquininha = await this.prisma.maquininha.findFirst({
      where: { ...this.buildEscopoDoOperador(user), id },
      select: { id: true, numeroSerie: true, saldoCredito: true },
    });

    if (!maquininha) {
      throw new NotFoundException('Maquininha não encontrada');
    }

    // Excluir com saldo deixaria o crédito preso: o aparelho some das
    // listagens levando o dinheiro junto, sem tela nenhuma para recuperá-lo.
    // Retirar antes é um AJUSTE_DEBITO, que fica registrado no extrato.
    if (maquininha.saldoCredito.gt(0)) {
      throw new ConflictException(
        `A maquininha ${maquininha.numeroSerie} ainda tem R$ ${maquininha.saldoCredito.toFixed(2)} ` +
          'de crédito. Zere o saldo com um AJUSTE_DEBITO antes de excluir.',
      );
    }

    await this.prisma.maquininha.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.logger.log(
      `Maquininha excluída: ${maquininha.numeroSerie} por ${user.id}`,
    );

    return { message: 'Maquininha excluída com sucesso', data: { id } };
  }

  /**
   * Consulta limite e saldo de crédito disponível do aparelho.
   *
   * Mesmo escopo de leitura do `garantirAcessoAoAparelho`: não exige status
   * ATIVA, e 404 cobre tanto "não existe" quanto "não é do operador" — nunca
   * 403, para não confirmar a existência de aparelho de outra rede/vendedor a
   * quem chutar UUID.
   */
  async consultarLimite(maquininhaId: string, user: RequestUser) {
    const maquininha = await this.prisma.maquininha.findFirst({
      where: { ...this.buildEscopoDoOperador(user), id: maquininhaId },
      select: {
        id: true,
        numeroSerie: true,
        status: true,
        limiteCredito: true,
        saldoCredito: true,
      },
    });

    if (!maquininha) {
      throw new NotFoundException(
        'Maquininha não encontrada ou não vinculada a este operador',
      );
    }

    return { message: 'Limite consultado com sucesso', data: maquininha };
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

  /**
   * Recorte de quem consulta — e o único lugar que exclui as apagadas.
   *
   * Toda leitura de maquininha passa por aqui, então o `deletedAt: null` mora
   * neste ponto em vez de repetido em cada consulta: uma leitura nova que
   * esqueça o filtro é a forma mais fácil de uma excluída reaparecer.
   */
  private buildEscopoDoOperador(
    user: RequestUser,
  ): Prisma.MaquininhaWhereInput {
    if (user.perfil === 'ADMIN') {
      return { deletedAt: null };
    }

    if (user.perfil === 'DISTRIBUIDOR') {
      if (!user.distribuidorId) {
        throw new ForbiddenException(
          'Operador distribuidor sem vínculo válido para acessar maquininhas',
        );
      }
      return { distribuidorId: user.distribuidorId, deletedAt: null };
    }

    if (user.perfil === 'VENDEDOR') {
      if (!user.vendedorId) {
        throw new ForbiddenException(
          'Operador vendedor sem vínculo válido para acessar maquininhas',
        );
      }
      return { vendedorId: user.vendedorId, deletedAt: null };
    }

    throw new ForbiddenException('Perfil sem acesso às maquininhas');
  }
}
