import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TipoCartela, TipoMovimentoCredito } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { calcularQuantidadeCartelasDaVenda } from '../vendas/vendas-quantidade.util';
import { LancarCreditoMaquininhaDto } from './dto/lancar-credito-maquininha.dto';
import { FiltroMovimentosCreditoDto } from './dto/filtro-movimentos-credito.dto';
import { AtualizarLimiteCreditoDto } from './dto/atualizar-limite-credito.dto';

/** Movimentos que somam no saldo. Os demais subtraem. */
const MOVIMENTOS_POSITIVOS: readonly TipoMovimentoCredito[] = [
  TipoMovimentoCredito.RECARGA,
  TipoMovimentoCredito.ESTORNO,
  TipoMovimentoCredito.AJUSTE_CREDITO,
];

const MOVIMENTO_SELECT = {
  id: true,
  tipo: true,
  valor: true,
  saldoAnterior: true,
  saldoPosterior: true,
  motivo: true,
  createdAt: true,
  maquininhaId: true,
  vendaId: true,
  vendaSenaId: true,
  criadoPorId: true,
  criadoPor: { select: { id: true, email: true, perfil: true } },
  // Dados da venda que originou o movimento: o extrato precisa responder
  // "quanto e quantas cartelas" sem uma segunda consulta por linha.
  //
  // `total` aqui é igual ao `valor` do movimento — o débito é sempre o total
  // cheio da venda. Vem mesmo assim para a linha se explicar sozinha, e para
  // que uma futura divergência (estorno parcial, por exemplo) apareça em vez
  // de ficar escondida atrás da suposição de que são sempre iguais.
  venda: {
    select: {
      id: true,
      total: true,
      quantidade: true,
      tipoCartela: true,
      status: true,
      createdAt: true,
    },
  },
  vendaSena: {
    select: {
      id: true,
      total: true,
      quantidade: true,
      status: true,
      createdAt: true,
    },
  },
} satisfies Prisma.MovimentoCreditoMaquininhaSelect;

interface MovimentoDeVenda {
  maquininhaId: string;
  vendaId?: string | null;
  vendaSenaId?: string | null;
  criadoPorId?: string | null;
}

/**
 * Crédito das maquininhas.
 *
 * O aparelho recebe um limite em reais concedido pelo ADMIN; a venda MANUAL
 * passada nele debita o saldo e o cancelamento devolve. Toda alteração de
 * saldo nasce de uma linha em `MovimentoCreditoMaquininha` — o razão é a fonte
 * da verdade, e `Maquininha.saldoCredito` é a materialização dele.
 *
 * `debitarVenda` e `estornarVenda` recebem o `tx` de quem chama e NUNCA abrem
 * transação própria: é isso que faz o crédito e a venda caírem ou passarem
 * juntos. Uma venda que falha depois do débito não deixa crédito consumido
 * para trás, porque nada foi commitado.
 */
@Injectable()
export class CreditosMaquininhaService {
  private readonly logger = new Logger(CreditosMaquininhaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Debita o valor da venda do saldo da maquininha, dentro da transação da
   * própria venda.
   *
   * A checagem de saldo e o decremento acontecem no MESMO `updateMany`
   * condicional. Ler o saldo e depois decrementar abriria janela para duas
   * vendas simultâneas passarem com crédito para uma só — aqui o Postgres
   * trava a linha durante o UPDATE e segura até o commit, então a segunda
   * transação enxerga o saldo já debitado e não encontra linha para atualizar.
   *
   * Aparelho com `limiteCredito` zero está sem controle de crédito: não debita
   * e não registra movimento. É o estado de quem ainda não recebeu limite.
   */
  async debitarVenda(
    tx: Prisma.TransactionClient,
    dados: MovimentoDeVenda & { valor: Prisma.Decimal | number },
  ): Promise<void> {
    const valor = new Prisma.Decimal(dados.valor);

    const maquininha = await tx.maquininha.findUnique({
      where: { id: dados.maquininhaId },
      select: { id: true, numeroSerie: true, limiteCredito: true },
    });

    if (!maquininha) {
      throw new NotFoundException('Maquininha não encontrada');
    }

    if (maquininha.limiteCredito.lte(0)) {
      return;
    }

    // Venda de valor zero (ou negativo, que não deveria existir) não move
    // crédito: registrar um movimento de R$ 0,00 só sujaria o extrato.
    if (valor.lte(0)) {
      return;
    }

    const { count } = await tx.maquininha.updateMany({
      where: { id: dados.maquininhaId, saldoCredito: { gte: valor } },
      data: { saldoCredito: { decrement: valor } },
    });

    if (count === 0) {
      const atual = await tx.maquininha.findUnique({
        where: { id: dados.maquininhaId },
        select: { saldoCredito: true },
      });
      throw new ConflictException(
        `Crédito insuficiente na maquininha ${maquininha.numeroSerie}. ` +
          `Disponível: R$ ${atual?.saldoCredito.toFixed(2) ?? '0.00'} — ` +
          `necessário: R$ ${valor.toFixed(2)}`,
      );
    }

    await this.registrarMovimento(tx, {
      ...dados,
      tipo: TipoMovimentoCredito.CONSUMO,
      valor,
    });

    this.logger.log(
      `Crédito debitado: R$ ${valor.toFixed(2)} da maquininha ${maquininha.numeroSerie}`,
    );
  }

  /**
   * Devolve à maquininha o crédito consumido por uma venda cancelada.
   *
   * O gatilho é o razão, não o status da venda: estorna se — e só se — existe
   * um CONSUMO para esta venda ainda sem ESTORNO. Venda MANUAL nasce APROVADO
   * e nunca passa por PENDENTE, então olhar o status não diria nada; olhar o
   * razão torna o estorno idempotente e casa com o `@@unique([vendaId, tipo])`
   * que o banco já impõe.
   */
  async estornarVenda(
    tx: Prisma.TransactionClient,
    dados: MovimentoDeVenda & { motivo?: string },
  ): Promise<void> {
    const filtroDaVenda = this.buildFiltroDaVenda(dados);
    if (!filtroDaVenda) return;

    const consumo = await tx.movimentoCreditoMaquininha.findFirst({
      where: { ...filtroDaVenda, tipo: TipoMovimentoCredito.CONSUMO },
      select: { id: true, valor: true, maquininhaId: true },
    });

    if (!consumo) return;

    const jaEstornado = await tx.movimentoCreditoMaquininha.findFirst({
      where: { ...filtroDaVenda, tipo: TipoMovimentoCredito.ESTORNO },
      select: { id: true },
    });

    if (jaEstornado) {
      this.logger.warn(
        `Estorno de crédito ignorado: venda ${consumo.id} já estornada`,
      );
      return;
    }

    await tx.maquininha.update({
      where: { id: consumo.maquininhaId },
      data: { saldoCredito: { increment: consumo.valor } },
    });

    await this.registrarMovimento(tx, {
      ...dados,
      maquininhaId: consumo.maquininhaId,
      tipo: TipoMovimentoCredito.ESTORNO,
      valor: consumo.valor,
      motivo: dados.motivo ?? 'Estorno por cancelamento da venda',
    });

    this.logger.log(
      `Crédito estornado: R$ ${consumo.valor.toFixed(2)} para a maquininha ${consumo.maquininhaId}`,
    );
  }

  /**
   * Lançamento manual do ADMIN: recarga ou ajuste.
   *
   * Ao contrário do débito de venda, abre a própria transação — não há nada
   * para amarrar junto.
   */
  async lancarMovimento(
    maquininhaId: string,
    dto: LancarCreditoMaquininhaDto,
    user: RequestUser,
  ) {
    const valor = new Prisma.Decimal(dto.valor);

    const movimento = await this.prisma.$transaction(async (tx) => {
      const maquininha = await tx.maquininha.findUnique({
        where: { id: maquininhaId },
        select: { id: true, numeroSerie: true, limiteCredito: true },
      });

      if (!maquininha) {
        throw new NotFoundException('Maquininha não encontrada');
      }

      const positivo = MOVIMENTOS_POSITIVOS.includes(dto.tipo);

      // Sem esta guarda, a comparação contra o teto reprovaria a recarga com
      // "excede o limite" quando o limite é zero — verdadeiro, mas ilegível.
      // O que o operador precisa saber é que falta conceder o limite antes.
      if (positivo && maquininha.limiteCredito.lte(0)) {
        throw new ConflictException(
          `A maquininha ${maquininha.numeroSerie} está sem limite de crédito. ` +
            'Defina o limite em PATCH /admin/maquininhas/:id/limite antes de recarregar.',
        );
      }

      if (positivo) {
        // Recarga não passa do teto concedido: o limite é o que o aparelho
        // pode ter na mão, e deixar o saldo furar isso esvaziaria o conceito.
        const { count } = await tx.maquininha.updateMany({
          where: {
            id: maquininhaId,
            saldoCredito: { lte: maquininha.limiteCredito.sub(valor) },
          },
          data: { saldoCredito: { increment: valor } },
        });

        if (count === 0) {
          const atual = await tx.maquininha.findUnique({
            where: { id: maquininhaId },
            select: { saldoCredito: true },
          });
          throw new ConflictException(
            `Recarga excede o limite da maquininha ${maquininha.numeroSerie}. ` +
              `Limite: R$ ${maquininha.limiteCredito.toFixed(2)} — ` +
              `saldo atual: R$ ${atual?.saldoCredito.toFixed(2) ?? '0.00'}`,
          );
        }
      } else {
        const { count } = await tx.maquininha.updateMany({
          where: { id: maquininhaId, saldoCredito: { gte: valor } },
          data: { saldoCredito: { decrement: valor } },
        });

        if (count === 0) {
          const atual = await tx.maquininha.findUnique({
            where: { id: maquininhaId },
            select: { saldoCredito: true },
          });
          throw new ConflictException(
            `Débito maior que o saldo da maquininha ${maquininha.numeroSerie}. ` +
              `Disponível: R$ ${atual?.saldoCredito.toFixed(2) ?? '0.00'}`,
          );
        }
      }

      return this.registrarMovimento(tx, {
        maquininhaId,
        tipo: dto.tipo,
        valor,
        motivo: dto.motivo,
        criadoPorId: user.id,
      });
    });

    this.logger.log(
      `Movimento ${dto.tipo} de R$ ${valor.toFixed(2)} lançado na maquininha ${maquininhaId} por ${user.id}`,
    );

    return {
      message: 'Movimento de crédito lançado com sucesso',
      data: movimento,
    };
  }

  /**
   * Define o teto de crédito do aparelho.
   *
   * Baixar o limite não confisca saldo já concedido: se o saldo atual passar
   * do teto novo, ele fica onde está e apenas para de aceitar recarga até
   * consumir a diferença. Retirar crédito da mão do vendedor é um
   * `AJUSTE_DEBITO` explícito, que fica registrado no extrato — não um efeito
   * colateral silencioso de editar o limite.
   */
  async atualizarLimite(
    maquininhaId: string,
    dto: AtualizarLimiteCreditoDto,
    user: RequestUser,
  ) {
    const maquininha = await this.prisma.maquininha.findUnique({
      where: { id: maquininhaId },
      select: { id: true, numeroSerie: true, limiteCredito: true },
    });

    if (!maquininha) {
      throw new NotFoundException('Maquininha não encontrada');
    }

    const atualizada = await this.prisma.maquininha.update({
      where: { id: maquininhaId },
      data: { limiteCredito: new Prisma.Decimal(dto.limiteCredito) },
      select: {
        id: true,
        numeroSerie: true,
        limiteCredito: true,
        saldoCredito: true,
      },
    });

    this.logger.log(
      `Limite da maquininha ${atualizada.numeroSerie} alterado de R$ ${maquininha.limiteCredito.toFixed(2)} ` +
        `para R$ ${atualizada.limiteCredito.toFixed(2)} por ${user.id}`,
    );

    return {
      message: 'Limite de crédito atualizado com sucesso',
      data: atualizada,
    };
  }

  /** Extrato paginado do aparelho. O escopo do operador é validado por fora. */
  async extrato(maquininhaId: string, filtros: FiltroMovimentosCreditoDto) {
    const pagination = normalizePagination(filtros.page, filtros.limit);
    const where: Prisma.MovimentoCreditoMaquininhaWhereInput = { maquininhaId };

    if (filtros.tipo) where.tipo = filtros.tipo;
    if (filtros.dataInicio || filtros.dataFim) {
      where.createdAt = {
        ...(filtros.dataInicio ? { gte: new Date(filtros.dataInicio) } : {}),
        ...(filtros.dataFim ? { lte: new Date(filtros.dataFim) } : {}),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.movimentoCreditoMaquininha.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        select: MOVIMENTO_SELECT,
      }),
      this.prisma.movimentoCreditoMaquininha.count({ where }),
    ]);

    return buildPaginatedResponse(
      data.map((movimento) => this.comCartelasDaVenda(movimento)),
      total,
      pagination.page,
      pagination.limit,
      {
        successMessage: 'Extrato de crédito listado com sucesso',
        emptyMessage: 'Nenhum movimento de crédito encontrado',
      },
    );
  }

  /**
   * Acrescenta `quantidadeCartelas` à venda de Prêmios do movimento.
   *
   * `Venda.quantidade` é o número de COMBOS, não de cartelas: um combo
   * `DUAS_CHANCES` vale 2 cartelas. Exibir a coluna crua faria o extrato
   * dizer "2 cartelas" numa venda que entregou 4. O resto da API já resolve
   * isso no `serializarVendaParaResposta`, por onde este extrato não passa —
   * daí reaproveitar o mesmo util em vez de recalcular no cliente, que criaria
   * uma segunda fonte da verdade para o multiplicador.
   *
   * `VendaSena.quantidade` já é a contagem de cartelas e fica como está.
   */
  private comCartelasDaVenda<
    T extends {
      venda: { quantidade: number; tipoCartela: TipoCartela | null } | null;
    },
  >(movimento: T): T {
    if (!movimento.venda) return movimento;

    return {
      ...movimento,
      venda: {
        ...movimento.venda,
        quantidadeCartelas: calcularQuantidadeCartelasDaVenda({
          quantidade: movimento.venda.quantidade,
          tipoCartela: movimento.venda.tipoCartela,
        }),
      },
    };
  }

  /**
   * Grava a linha do razão com o saldo depois já materializado na maquininha.
   *
   * O saldo é relido de dentro da transação, com a linha ainda travada pelo
   * UPDATE que a antecede — por isso `saldoPosterior` é exato e
   * `saldoAnterior` é dedutível dele sem uma segunda leitura.
   */
  private async registrarMovimento(
    tx: Prisma.TransactionClient,
    dados: MovimentoDeVenda & {
      tipo: TipoMovimentoCredito;
      valor: Prisma.Decimal;
      motivo?: string;
    },
  ) {
    const maquininha = await tx.maquininha.findUniqueOrThrow({
      where: { id: dados.maquininhaId },
      select: { saldoCredito: true },
    });

    const saldoPosterior = maquininha.saldoCredito;
    const saldoAnterior = MOVIMENTOS_POSITIVOS.includes(dados.tipo)
      ? saldoPosterior.sub(dados.valor)
      : saldoPosterior.add(dados.valor);

    return tx.movimentoCreditoMaquininha.create({
      data: {
        maquininhaId: dados.maquininhaId,
        tipo: dados.tipo,
        valor: dados.valor,
        saldoAnterior,
        saldoPosterior,
        vendaId: dados.vendaId ?? null,
        vendaSenaId: dados.vendaSenaId ?? null,
        criadoPorId: dados.criadoPorId ?? null,
        motivo: dados.motivo ?? null,
      },
      select: MOVIMENTO_SELECT,
    });
  }

  /**
   * Filtro que identifica os movimentos de uma venda.
   *
   * Precisa apontar exatamente um dos dois campos: `{ vendaId: null }` casaria
   * com toda recarga do aparelho, e um estorno rodaria em cima do movimento
   * errado.
   */
  private buildFiltroDaVenda(
    dados: MovimentoDeVenda,
  ): Prisma.MovimentoCreditoMaquininhaWhereInput | null {
    if (dados.vendaId) return { vendaId: dados.vendaId };
    if (dados.vendaSenaId) return { vendaSenaId: dados.vendaSenaId };
    return null;
  }
}
