import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ModoSelecaoSena,
  OrigemParticipacao,
  Perfil,
  Prisma,
  StatusCartelaSena,
  StatusEdicaoSena,
  StatusVendaSena,
  TipoPagamento,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../../common/utils/pagination.util';
import { PaymentGatewayFactory } from '../../pagamentos/gateways/payment-gateway.factory';
import { CreateVendaSenaDto } from './dto/create-venda-sena.dto';
import { FiltroVendasSenaDto } from './dto/filtro-vendas-sena.dto';
import type { RequestUser } from '../../auth/strategies/jwt.strategy';
import {
  parseEValidarDataNascimento,
  validarMaioridade,
} from '../../../common/utils/data-nascimento.util';
import { resolverVinculoCliente } from '../../../common/utils/vinculo-cliente.util';

type PrismaTransactionClient = Prisma.TransactionClient;

const PIX_EXPIRACAO_SEGUNDOS = 3600;

const VENDA_SENA_INCLUDE = {
  edicaoSena: { select: { id: true, numero: true, valorCartela: true } },
  cliente: { select: { id: true, nome: true, cpf: true, telefone: true } },
  vendedor: { select: { id: true, nome: true, codigo: true } },
  cartelas: true,
} as const;

interface SellerOrigemResolvida {
  vendedorId: string | null;
  distribuidorId: string | null;
}

interface RelacionamentoClienteMaisRecente {
  vendedorId?: string | null;
  distribuidorId?: string | null;
}

interface CreateVendaSenaOptions {
  skipGateway?: boolean;
  origemParticipacao?: OrigemParticipacao;
  requireGateway?: boolean;
}

interface NumerosSenaRecebidos {
  numeros: number[];
  bola_extra: number;
}

interface CartelaSenaNormalizada {
  numeros: number[];
  bolaExtra: number;
  modoSelecao: ModoSelecaoSena;
}

interface ClienteSenaCompra {
  id: string;
  cpf: string;
  nome: string;
  telefone: string;
  email: string | null;
  dataNascimento: Date | null;
}

interface DadosClientePagamentoSena {
  id: string;
  cpf: string;
  nome: string;
  telefone: string;
  // Opcional como no Capital Prêmios: o checkout pede só nome, CPF e telefone.
  // O gateway usa um endereço padrão quando não há e-mail.
  email?: string;
}

@Injectable()
export class VendasSenaService {
  private readonly logger = new Logger(VendasSenaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentGatewayFactory: PaymentGatewayFactory,
  ) {}

  // ─── CREATE ────────────────────────────────────────────

  async create(
    dto: CreateVendaSenaDto,
    user?: RequestUser,
    options?: CreateVendaSenaOptions,
  ) {
    // 1. Validar edição
    const edicao = await this.prisma.edicaoSena.findUnique({
      where: { id: dto.edicaoSenaId },
      include: { combos: { where: { ativo: true } } },
    });
    if (!edicao) throw new NotFoundException('Edição Sena não encontrada');
    if (edicao.status !== StatusEdicaoSena.ATIVA) {
      throw new BadRequestException(
        `A edição Sena "${edicao.numero}" não está ativa (status: ${edicao.status})`,
      );
    }

    const dataAgora = new Date();
    if (dataAgora >= edicao.dataEncerramento) {
      throw new BadRequestException(
        'As compras para esta edição já foram encerradas',
      );
    }

    // Um `seller_id` resolvido substitui o PAR inteiro, nunca campo a campo:
    // com `??` por campo, um link de distribuidor (que resolve vendedorId nulo
    // por definição) deixava passar o vendedorId do corpo, misturando redes.
    //
    // Só age quando não veio vínculo explícito. Os controllers já limpam esses
    // campos para VENDEDOR, DISTRIBUIDOR e para a loja pública, então na
    // prática isso preserva o par que o ADMIN informou de propósito — sem ele,
    // um seller_id de distribuidor zerava o vendedorId do ADMIN e a comissão
    // do vendedor sumia em silêncio.
    let distribuidorDoVendedor: string | undefined;

    if (dto.seller_id) {
      // Resolvido sempre que vier, mesmo quando não for usado: assim um
      // `seller_id` inexistente continua falhando com 404 em vez de ser
      // descartado em silêncio.
      const sellerOrigem = await this.resolverSellerOrigem(dto.seller_id);

      if (!dto.vendedorId && !dto.distribuidorId) {
        dto.vendedorId = sellerOrigem.vendedorId ?? undefined;
        dto.distribuidorId = sellerOrigem.distribuidorId ?? undefined;
        // O seller já foi resolvido contra o banco: a etapa 4 não precisa
        // reconsultar o mesmo vendedor.
        distribuidorDoVendedor = sellerOrigem.vendedorId
          ? (sellerOrigem.distribuidorId ?? undefined)
          : undefined;
      }
    }

    // 2. Resolver combo (define quantidade esperada quando há combo)
    let comboSenaId: string | null = null;
    let quantidadeCombo: number | null = null;
    if (dto.comboSenaId) {
      const combo = edicao.combos.find((c) => c.id === dto.comboSenaId);
      if (!combo)
        throw new BadRequestException('Combo Sena não encontrado nesta edição');
      comboSenaId = combo.id;
      quantidadeCombo = combo.quantidade;
    }

    // 3. Resolver cartelas recebidas do frontend
    const cartelas = this.resolverCartelasDaVenda(
      dto.numeros,
      dto.modoSelecao,
      dto.quantidade,
      quantidadeCombo,
    );

    if (quantidadeCombo !== null && cartelas.length !== quantidadeCombo) {
      const combo = edicao.combos.find((c) => c.id === comboSenaId);
      throw new BadRequestException(
        `O combo "${combo?.nome ?? comboSenaId}" requer exatamente ${quantidadeCombo} cartela(s)`,
      );
    }

    // 4. Validar vendedor / distribuidor
    //
    // Roda ANTES de resolver o cliente: a resolução grava o vínculo comercial
    // no cadastro, e um vendedor recusado aqui não pode deixar rastro lá.
    if (dto.vendedorId) {
      // A consulta é pulada quando o `seller_id` já resolveu este vendedor
      // contra o banco — as validações abaixo continuam valendo.
      if (!distribuidorDoVendedor) {
        const vendedor = await this.prisma.vendedor.findUnique({
          where: { id: dto.vendedorId },
          select: { id: true, distribuidorId: true },
        });
        if (!vendedor) throw new NotFoundException('Vendedor não encontrado');

        distribuidorDoVendedor = vendedor.distribuidorId;
      }

      // Um DISTRIBUIDOR pode lançar venda para um vendedor da própria rede,
      // mas não para o de outra — senão escolheria a quem creditar a comissão.
      if (
        user?.perfil === 'DISTRIBUIDOR' &&
        distribuidorDoVendedor !== user.distribuidorId
      ) {
        throw new ForbiddenException(
          'Vendedor não pertence ao distribuidor autenticado',
        );
      }

      if (!dto.distribuidorId) dto.distribuidorId = distribuidorDoVendedor;
    }
    if (dto.distribuidorId) {
      const dist = await this.prisma.distribuidor.findUnique({
        where: { id: dto.distribuidorId },
      });
      if (!dist) throw new NotFoundException('Distribuidor não encontrado');
    }

    // 5. Buscar cliente por ID ou criar/resolver pelo CPF legado
    const cliente = dto.clienteId
      ? await this.buscarClientePorIdParaCompra(
          dto.clienteId,
          dto.vendedorId,
          dto.distribuidorId,
          distribuidorDoVendedor,
        )
      : await this.buscarOuCriarClientePorDto(dto, distribuidorDoVendedor);
    const dadosClientePagamento =
      this.validarDadosClienteParaPagamento(cliente);

    // 6. Resolucionar vendedor do usuário logado
    const vendedorId =
      user?.perfil === 'VENDEDOR' && user.vendedorId
        ? user.vendedorId
        : (dto.vendedorId ?? null);
    const distribuidorId =
      user?.perfil === 'DISTRIBUIDOR' && user.distribuidorId
        ? user.distribuidorId
        : (dto.distribuidorId ?? null);

    // 7. Calcular total
    const tipoPagamento = this.resolverTipoPagamento(dto.tipoPagamento, user);
    const origemParticipacao =
      options?.origemParticipacao ?? OrigemParticipacao.DIGITAL;

    const valorCombo = dto.comboSenaId
      ? (edicao.combos.find((c) => c.id === dto.comboSenaId)?.preco ?? null)
      : null;
    const valorUnitario = Number(edicao.valorCartela);
    const total = valorCombo
      ? Number(valorCombo)
      : valorUnitario * cartelas.length;

    // 8. Criar venda (MANUAL = imediatamente aprovado)
    if (tipoPagamento === TipoPagamento.MANUAL) {
      const resultado = await this.prisma.$transaction(async (tx) => {
        const venda = await tx.vendaSena.create({
          data: {
            edicaoSenaId: edicao.id,
            clienteId: cliente.id,
            vendedorId,
            distribuidorId,
            comboSenaId,
            quantidade: cartelas.length,
            total: new Prisma.Decimal(total.toFixed(2)),
            status: StatusVendaSena.APROVADO,
            tipoPagamento,
            origemParticipacao,
          },
        });
        const cartelasGeradas = await this.criarCartelasRecebidas(
          tx,
          venda.id,
          edicao.id,
          cartelas,
        );
        await this.gerarComissaoSena(
          tx,
          venda,
          vendedorId,
          distribuidorId,
          total,
        );
        return { venda, cartelas: cartelasGeradas };
      });

      this.logger.log(
        `VendaSena MANUAL ${resultado.venda.id} criada — ${cartelas.length} cartela(s) — R$ ${total.toFixed(2)}`,
      );
      return {
        message: 'Venda Sena criada e aprovada com sucesso',
        data: await this.findOne(resultado.venda.id),
      };
    }

    // 9. Criar venda PENDENTE
    const venda = await this.prisma.vendaSena.create({
      data: {
        edicaoSenaId: edicao.id,
        clienteId: cliente.id,
        vendedorId,
        distribuidorId,
        comboSenaId,
        quantidade: cartelas.length,
        total: new Prisma.Decimal(total.toFixed(2)),
        status: StatusVendaSena.PENDENTE,
        tipoPagamento,
        origemParticipacao,
        // Guardar cartelas no payload para criar após confirmação
        gatewayPayload: {
          modoSelecao: dto.modoSelecao,
          numeros: this.toNumerosGatewayPayload(cartelas),
        } as unknown as Prisma.InputJsonValue,
      },
    });

    // 10. Criar cobrança no gateway
    //
    // No canal POS o pagamento é processado pela maquininha; a venda permanece
    // PENDENTE e é confirmada depois via confirmarPagamento (skipGateway).
    let dadosPagamento: {
      pixCopiaECola?: string;
      qrCodeBase64?: string;
      urlPagamento?: string;
    } = {};

    if (!options?.skipGateway) {
      try {
        const gateway = this.paymentGatewayFactory.getGateway(tipoPagamento);
        const cobranca = await gateway.criarCobranca({
          vendaId: venda.id,
          valorCentavos: Math.round(total * 100),
          quantidadeItens: dto.comboSenaId ? 1 : cartelas.length,
          valorUnitarioCentavos: dto.comboSenaId
            ? Math.round(Number(valorCombo) * 100)
            : Math.round(valorUnitario * 100),
          descricao: `Capital Sena — Edição ${edicao.numero} — ${cartelas.length} cartela(s)`,
          cpfPagador: dadosClientePagamento.cpf,
          nomePagador: dadosClientePagamento.nome,
          emailPagador: dadosClientePagamento.email,
          telefonePagador: dadosClientePagamento.telefone,
          expiracaoSegundos: PIX_EXPIRACAO_SEGUNDOS,
        });

        await this.prisma.vendaSena.update({
          where: { id: venda.id },
          data: {
            gatewayId: cobranca.gatewayId,
            gatewayPayload: {
              ...(cobranca.payload ?? {}),
              modoSelecao: dto.modoSelecao,
              numeros: this.toNumerosGatewayPayload(cartelas),
            } as unknown as Prisma.InputJsonValue,
          },
        });

        dadosPagamento = {
          pixCopiaECola: cobranca.pixCopiaECola,
          qrCodeBase64: cobranca.qrCodeBase64,
          urlPagamento: cobranca.urlPagamento,
        };

        this.logger.log(
          `Cobrança Sena criada: gatewayId=${cobranca.gatewayId}`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Erro ao criar cobrança Sena para venda ${venda.id}: ${errorMessage}`,
        );

        if (options?.requireGateway) {
          await this.prisma.vendaSena.update({
            where: { id: venda.id },
            data: {
              status: StatusVendaSena.RECUSADO,
              gatewayPayload: {
                modoSelecao: dto.modoSelecao,
                numeros: this.toNumerosGatewayPayload(cartelas),
                erroPagamento: errorMessage,
              } as unknown as Prisma.InputJsonValue,
            },
          });
          throw new BadGatewayException(
            'Não foi possível processar o pagamento Sena. Tente novamente.',
          );
        }
      }
    }

    const vendaCompleta = await this.prisma.vendaSena.findUnique({
      where: { id: venda.id },
      include: VENDA_SENA_INCLUDE,
    });

    const vendaComDistribuidor = await this.anexarDistribuidorNaVendaSena(
      this.serializarVenda(vendaCompleta!),
    );

    return {
      message: 'Venda Sena criada com sucesso',
      data: {
        ...vendaComDistribuidor,
        pagamento: dadosPagamento,
      },
    };
  }

  // ─── CONFIRMAR PAGAMENTO (webhook) ────────────────────

  async confirmarPagamento(
    vendaSenaId: string,
    gatewayPayload?: Record<string, unknown>,
  ) {
    const venda = await this.prisma.vendaSena.findUnique({
      where: { id: vendaSenaId },
    });

    if (!venda) throw new NotFoundException('Venda Sena não encontrada');
    if (venda.status !== StatusVendaSena.PENDENTE) {
      throw new ConflictException(
        `Venda Sena já processada (status: ${venda.status})`,
      );
    }

    // Recuperar números do gatewayPayload
    const payload = (venda.gatewayPayload ?? {}) as Record<string, unknown>;
    const numerosRaw = (payload['numeros'] ?? []) as NumerosSenaRecebidos[];
    const modoSelecao = this.normalizarModoSelecao(
      payload['modoSelecao'] as ModoSelecaoSena | undefined,
    );
    const cartelas = this.validarNumerosDaVenda(numerosRaw, modoSelecao);

    await this.prisma.$transaction(async (tx) => {
      // Atualizar status da venda
      await tx.vendaSena.update({
        where: { id: vendaSenaId },
        data: {
          status: StatusVendaSena.APROVADO,
          gatewayPayload: {
            ...payload,
            ...(gatewayPayload ?? {}),
            confirmadoEm: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      // Criar cartelas com a bola extra enviada pelo frontend
      await this.criarCartelasRecebidas(
        tx,
        vendaSenaId,
        venda.edicaoSenaId,
        cartelas,
      );

      // Comissões
      await this.gerarComissaoSena(
        tx,
        venda,
        venda.vendedorId,
        venda.distribuidorId,
        Number(venda.total),
      );
    });

    this.logger.log(`VendaSena ${vendaSenaId} confirmada e cartelas geradas`);
    return {
      message: 'Pagamento Sena confirmado',
      data: await this.findOne(vendaSenaId),
    };
  }

  // ─── FIND ALL ──────────────────────────────────────────

  async findAll(filtros: FiltroVendasSenaDto = {}) {
    const pagination = normalizePagination(
      filtros.page ?? 1,
      filtros.limit ?? 20,
    );
    const where = this.buildWhere(filtros);

    const [data, total] = await Promise.all([
      this.prisma.vendaSena.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: VENDA_SENA_INCLUDE,
      }),
      this.prisma.vendaSena.count({ where }),
    ]);

    const vendasComDistribuidor = await this.anexarDistribuidorNasVendasSena(
      data.map((v) => this.serializarVenda(v)),
    );

    return buildPaginatedResponse(
      vendasComDistribuidor,
      total,
      pagination.page,
      pagination.limit,
      {
        successMessage: 'Vendas Sena listadas com sucesso',
        emptyMessage: 'Nenhuma venda Sena encontrada',
      },
    );
  }

  // ─── FIND ONE ──────────────────────────────────────────

  async findOne(id: string) {
    const venda = await this.prisma.vendaSena.findUnique({
      where: { id },
      include: VENDA_SENA_INCLUDE,
    });
    if (!venda) throw new NotFoundException('Venda Sena não encontrada');
    return this.anexarDistribuidorNaVendaSena(this.serializarVenda(venda));
  }

  // ─── FIND BY CLIENTE CPF ──────────────────────────────

  async findByCliente(cpf: string, page = 1, limit = 20) {
    const cpfLimpo = cpf.replace(/\D/g, '');
    const pagination = normalizePagination(page, limit);

    const cliente = await this.prisma.cliente.findUnique({
      where: { cpf: cpfLimpo },
      select: { id: true },
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');

    const [data, total] = await Promise.all([
      this.prisma.vendaSena.findMany({
        where: { clienteId: cliente.id },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: VENDA_SENA_INCLUDE,
      }),
      this.prisma.vendaSena.count({ where: { clienteId: cliente.id } }),
    ]);

    const vendasComDistribuidor = await this.anexarDistribuidorNasVendasSena(
      data.map((v) => this.serializarVenda(v)),
    );

    return buildPaginatedResponse(
      vendasComDistribuidor,
      total,
      pagination.page,
      pagination.limit,
      {
        successMessage: 'Vendas Sena do cliente listadas',
        emptyMessage: 'Nenhuma venda encontrada',
      },
    );
  }

  // ─── CANCELAR ──────────────────────────────────────────

  async cancelar(id: string, motivo?: string) {
    const venda = await this.prisma.vendaSena.findUnique({
      where: { id },
      include: { cartelas: true, comissaoSena: true },
    });
    if (!venda) throw new NotFoundException('Venda Sena não encontrada');
    if (venda.status === StatusVendaSena.CANCELADO) {
      throw new ConflictException('Venda Sena já está cancelada');
    }

    await this.prisma.$transaction(async (tx) => {
      // Reverter cartelas a pendente_pagamento ou excluir
      if (venda.cartelas.length > 0) {
        await tx.cartelaSena.deleteMany({ where: { vendaSenaId: id } });
      }

      // Reverter comissão
      if (venda.comissaoSena && venda.vendedorId) {
        await tx.vendedor.update({
          where: { id: venda.vendedorId },
          data: { saldo: { decrement: venda.comissaoSena.valor } },
        });
        await tx.comissaoSena.delete({ where: { id: venda.comissaoSena.id } });
      }

      // Cancelar no gateway
      if (venda.gatewayId) {
        try {
          const gateway = this.paymentGatewayFactory.getGatewayParaConsulta(
            venda.tipoPagamento,
            venda.gatewayPayload,
          );
          await gateway.cancelarCobranca(venda.gatewayId);
        } catch (err) {
          this.logger.warn(
            `Erro ao cancelar cobrança Sena no gateway: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      await tx.vendaSena.update({
        where: { id },
        data: {
          status: StatusVendaSena.CANCELADO,
          gatewayPayload: {
            ...((venda.gatewayPayload as Record<string, unknown>) ?? {}),
            motivoCancelamento: motivo ?? 'Cancelado pelo administrador',
            canceladoEm: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
    });

    this.logger.log(`VendaSena ${id} cancelada. Motivo: ${motivo ?? 'N/A'}`);
    return { message: 'Venda Sena cancelada com sucesso', data: { id } };
  }

  // ─── HELPERS ──────────────────────────────────────────

  private static readonly NUMEROS_POR_CARTELA = 6;
  private static readonly NUMERO_MIN = 1;
  private static readonly NUMERO_MAX = 60;

  private resolverCartelasDaVenda(
    numerosRecebidos: NumerosSenaRecebidos[] | undefined,
    modoSelecao: ModoSelecaoSena | undefined,
    quantidade: number | undefined,
    quantidadeCombo: number | null,
  ): CartelaSenaNormalizada[] {
    if (!numerosRecebidos || numerosRecebidos.length === 0) {
      throw new BadRequestException('Informe `numeros` para a compra Sena');
    }

    const cartelas = this.validarNumerosDaVenda(
      numerosRecebidos,
      this.normalizarModoSelecao(modoSelecao),
    );
    const quantidadeEsperada = quantidadeCombo ?? quantidade ?? null;

    if (quantidadeEsperada !== null && cartelas.length !== quantidadeEsperada) {
      throw new BadRequestException(
        `A compra Sena requer exatamente ${quantidadeEsperada} cartela(s) em numeros`,
      );
    }

    return cartelas;
  }

  private validarNumerosDaVenda(
    itens: NumerosSenaRecebidos[],
    modoSelecao: ModoSelecaoSena,
  ): CartelaSenaNormalizada[] {
    return itens.map((item) => {
      if (
        !Array.isArray(item.numeros) ||
        item.numeros.length !== VendasSenaService.NUMEROS_POR_CARTELA
      ) {
        throw new BadRequestException(
          'Cada item de numeros requer exatamente 6 números',
        );
      }
      this.validarNumerosCartela(item.numeros);
      this.validarBolaExtra(item.bola_extra, item.numeros);

      return {
        numeros: [...item.numeros],
        bolaExtra: item.bola_extra,
        modoSelecao,
      };
    });
  }

  private validarNumerosCartela(numeros: number[]): void {
    if (new Set(numeros).size !== numeros.length) {
      throw new BadRequestException('Números da cartela não podem se repetir');
    }
    if (
      numeros.some(
        (n) =>
          n < VendasSenaService.NUMERO_MIN || n > VendasSenaService.NUMERO_MAX,
      )
    ) {
      throw new BadRequestException(
        'Números da cartela devem estar entre 1 e 60',
      );
    }
  }

  private validarBolaExtra(bolaExtra: number, numeros: number[]): void {
    if (
      !Number.isInteger(bolaExtra) ||
      bolaExtra < VendasSenaService.NUMERO_MIN ||
      bolaExtra > VendasSenaService.NUMERO_MAX
    ) {
      throw new BadRequestException('bola_extra deve estar entre 1 e 60');
    }

    if (numeros.includes(bolaExtra)) {
      throw new BadRequestException(
        'bola_extra não pode repetir um dos 6 números da cartela',
      );
    }
  }

  private normalizarModoSelecao(
    modoSelecao: ModoSelecaoSena | undefined,
  ): ModoSelecaoSena {
    if (modoSelecao === undefined) {
      return ModoSelecaoSena.MANUAL;
    }

    if (!Object.values(ModoSelecaoSena).includes(modoSelecao)) {
      throw new BadRequestException(
        'modoSelecao deve ser MANUAL ou SURPRESINHA',
      );
    }

    return modoSelecao;
  }

  private toNumerosGatewayPayload(
    cartelas: CartelaSenaNormalizada[],
  ): NumerosSenaRecebidos[] {
    return cartelas.map((cartela) => ({
      numeros: cartela.numeros,
      bola_extra: cartela.bolaExtra,
    }));
  }

  private async criarCartelasRecebidas(
    tx: PrismaTransactionClient,
    vendaSenaId: string,
    edicaoSenaId: string,
    cartelas: CartelaSenaNormalizada[],
  ) {
    const criadas = await Promise.all(
      cartelas.map((c) =>
        tx.cartelaSena.create({
          data: {
            vendaSenaId,
            edicaoSenaId,
            numerosEscolhidos: c.numeros,
            setimoNumero: c.bolaExtra,
            modoSelecao: c.modoSelecao,
            status: StatusCartelaSena.CONFIRMADA,
          },
        }),
      ),
    );
    return criadas;
  }

  private async gerarComissaoSena(
    tx: PrismaTransactionClient,
    venda: { id: string; distribuidorId: string | null },
    vendedorId: string | null,
    distribuidorId: string | null,
    total: number,
  ) {
    // Comissão vendedor
    if (vendedorId) {
      const vendedor = await tx.vendedor.findUnique({
        where: { id: vendedorId },
        select: { comissaoPercent: true },
      });
      if (vendedor && Number(vendedor.comissaoPercent) > 0) {
        const valorComissao = (total * Number(vendedor.comissaoPercent)) / 100;
        await tx.comissaoSena.create({
          data: {
            vendedorId,
            vendaSenaId: venda.id,
            valor: new Prisma.Decimal(valorComissao.toFixed(2)),
          },
        });
        await tx.vendedor.update({
          where: { id: vendedorId },
          data: {
            saldo: { increment: new Prisma.Decimal(valorComissao.toFixed(2)) },
          },
        });
      }
    }

    // Comissão distribuidor
    const distId = distribuidorId ?? venda.distribuidorId;
    if (distId) {
      const dist = await tx.distribuidor.findUnique({
        where: { id: distId },
        select: { comissaoPercent: true },
      });
      if (dist && Number(dist.comissaoPercent) > 0) {
        const valorComissao = (total * Number(dist.comissaoPercent)) / 100;
        await tx.comissaoDistribuidorSena.create({
          data: {
            distribuidorId: distId,
            vendaSenaId: venda.id,
            valor: new Prisma.Decimal(valorComissao.toFixed(2)),
          },
        });
        await tx.distribuidor.update({
          where: { id: distId },
          data: {
            saldo: { increment: new Prisma.Decimal(valorComissao.toFixed(2)) },
          },
        });
      }
    }
  }

  private async buscarOuCriarClientePorDto(
    dto: CreateVendaSenaDto,
    distribuidorDoVendedorConhecido?: string,
  ): Promise<ClienteSenaCompra> {
    // Mesmos obrigatórios do Capital Prêmios (LojaPublicaService): CPF, nome e
    // telefone. E-mail e data de nascimento são opcionais.
    if (!dto.cpf || !dto.nome || !dto.telefone) {
      throw new BadRequestException(
        'Informe clienteId ou os dados completos do cliente para concluir a compra',
      );
    }

    return this.buscarOuCriarCliente(
      dto.cpf.replace(/\D/g, ''),
      dto.nome,
      dto.telefone ?? '',
      dto.dataNascimento,
      dto.email,
      dto.vendedorId,
      dto.distribuidorId,
      distribuidorDoVendedorConhecido,
    );
  }

  private async buscarClientePorIdParaCompra(
    clienteId: string,
    vendedorId?: string,
    distribuidorId?: string,
    distribuidorDoVendedorConhecido?: string,
  ): Promise<ClienteSenaCompra> {
    const relacionamentoMaisRecente =
      await this.resolverRelacionamentoMaisRecenteDoCliente(
        vendedorId,
        distribuidorId,
        distribuidorDoVendedorConhecido,
      );

    const cliente = await this.prisma.cliente.findUnique({
      where: { id: clienteId },
      select: {
        id: true,
        cpf: true,
        nome: true,
        telefone: true,
        email: true,
        dataNascimento: true,
      },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente não encontrado');
    }

    if (Object.keys(relacionamentoMaisRecente).length === 0) {
      return cliente;
    }

    return this.prisma.cliente.update({
      where: { id: clienteId },
      data: relacionamentoMaisRecente,
      select: {
        id: true,
        cpf: true,
        nome: true,
        telefone: true,
        email: true,
        dataNascimento: true,
      },
    });
  }

  /**
   * Mesma regra do Capital Prêmios (VendasService.validarDadosClienteParaPagamento):
   * e-mail não bloqueia a compra, porque o checkout pede só nome, CPF e
   * telefone. O gateway substitui por um endereço padrão quando falta.
   */
  private validarDadosClienteParaPagamento(
    cliente: ClienteSenaCompra,
  ): DadosClientePagamentoSena {
    if (cliente.dataNascimento) {
      validarMaioridade(cliente.dataNascimento);
    }

    return {
      id: cliente.id,
      cpf: cliente.cpf.replace(/\D/g, ''),
      nome: cliente.nome,
      telefone: cliente.telefone,
      email: cliente.email ?? undefined,
    };
  }

  private async buscarOuCriarCliente(
    cpf: string,
    nome: string,
    telefone: string,
    dataNascimentoInput: string | undefined,
    email?: string,
    vendedorId?: string,
    distribuidorId?: string,
    distribuidorDoVendedorConhecido?: string,
  ): Promise<ClienteSenaCompra> {
    const dataNascimento = dataNascimentoInput
      ? parseEValidarDataNascimento(dataNascimentoInput)
      : null;
    const relacionamentoMaisRecente =
      await this.resolverRelacionamentoMaisRecenteDoCliente(
        vendedorId,
        distribuidorId,
        distribuidorDoVendedorConhecido,
      );
    const existente = await this.prisma.cliente.findUnique({ where: { cpf } });

    if (existente) {
      if (!existente.dataNascimento && dataNascimento) {
        return this.prisma.cliente.update({
          where: { cpf },
          data: {
            dataNascimento,
            ...relacionamentoMaisRecente,
          },
        });
      }

      if (existente.dataNascimento) {
        validarMaioridade(existente.dataNascimento);
      }

      if (Object.keys(relacionamentoMaisRecente).length > 0) {
        return this.prisma.cliente.update({
          where: { cpf },
          data: relacionamentoMaisRecente,
        });
      }

      return existente;
    }

    return this.prisma.cliente.create({
      data: {
        cpf,
        nome,
        telefone,
        email: email ?? null,
        dataNascimento,
        vendedorId: relacionamentoMaisRecente.vendedorId ?? null,
        distribuidorId: relacionamentoMaisRecente.distribuidorId ?? null,
      },
    });
  }

  private async resolverRelacionamentoMaisRecenteDoCliente(
    vendedorId?: string,
    distribuidorId?: string,
    /** Evita reconsultar o vendedor quando o chamador já o carregou. */
    distribuidorDoVendedorConhecido?: string,
  ): Promise<RelacionamentoClienteMaisRecente> {
    let distribuidorDoVendedor: string | null =
      distribuidorDoVendedorConhecido ?? null;

    if (vendedorId && !distribuidorDoVendedor) {
      const vendedor = await this.prisma.vendedor.findUnique({
        where: { id: vendedorId },
        select: { distribuidorId: true },
      });

      // `create` já valida o vendedor na etapa 4, antes de chegar aqui. O 404
      // permanece porque este método também é alcançado por caminhos que não
      // passam por aquela validação; sem ele o par (vendedor, null) seria
      // gravado e a CHECK do banco devolveria erro de constraint.
      if (!vendedor) {
        throw new NotFoundException('Vendedor não encontrado');
      }

      distribuidorDoVendedor = vendedor.distribuidorId;
    }

    // `null` = nada informado; aqui significa preservar o vínculo atual do
    // cliente, então devolvemos um objeto vazio.
    return (
      resolverVinculoCliente({
        vendedorId,
        distribuidorId,
        distribuidorDoVendedor,
      }) ?? {}
    );
  }

  private resolverTipoPagamento(
    tipo: TipoPagamento,
    user?: RequestUser,
  ): TipoPagamento {
    if (user?.perfil === 'ADMIN') return TipoPagamento.MANUAL;
    return tipo;
  }

  private async resolverSellerOrigem(
    sellerId?: string,
  ): Promise<SellerOrigemResolvida> {
    if (!sellerId) {
      return { vendedorId: null, distribuidorId: null };
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: sellerId },
      select: { id: true, perfil: true },
    });

    if (usuario?.perfil === Perfil.VENDEDOR) {
      const vendedor = await this.prisma.vendedor.findUnique({
        where: { usuarioId: usuario.id },
        select: { id: true, distribuidorId: true },
      });

      if (!vendedor) {
        throw new NotFoundException('Vendedor não encontrado');
      }

      return {
        vendedorId: vendedor.id,
        distribuidorId: vendedor.distribuidorId,
      };
    }

    if (usuario?.perfil === Perfil.DISTRIBUIDOR) {
      const distribuidor = await this.prisma.distribuidor.findUnique({
        where: { usuarioId: usuario.id },
        select: { id: true },
      });

      if (!distribuidor) {
        throw new NotFoundException('Distribuidor não encontrado');
      }

      return { vendedorId: null, distribuidorId: distribuidor.id };
    }

    const vendedor = await this.prisma.vendedor.findUnique({
      where: { id: sellerId },
      select: { id: true, distribuidorId: true },
    });

    if (vendedor) {
      return {
        vendedorId: vendedor.id,
        distribuidorId: vendedor.distribuidorId,
      };
    }

    const distribuidor = await this.prisma.distribuidor.findUnique({
      where: { id: sellerId },
      select: { id: true },
    });

    if (distribuidor) {
      return { vendedorId: null, distribuidorId: distribuidor.id };
    }

    throw new NotFoundException('Seller não encontrado');
  }

  private buildWhere(filtros: FiltroVendasSenaDto): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (filtros.edicaoSenaId) where.edicaoSenaId = filtros.edicaoSenaId;
    const clienteId = filtros.clienteId ?? filtros.clientId;
    if (clienteId) where.clienteId = clienteId;
    if (filtros.vendedorId) where.vendedorId = filtros.vendedorId;
    if (filtros.distribuidorId) where.distribuidorId = filtros.distribuidorId;
    if (filtros.status) where.status = filtros.status;
    if (filtros.cpf) {
      const cpfLimpo = filtros.cpf.replace(/\D/g, '');
      where.cliente = { cpf: cpfLimpo };
    }
    return where;
  }

  // ─── DISTRIBUIDOR ──────────────────────────────────────
  //
  // VendaSena guarda apenas o escalar distribuidorId — não existe relação
  // `distribuidor` no schema, então o include nunca traz esse dado. Os helpers
  // abaixo buscam o distribuidor à parte e o anexam na resposta, do mesmo modo
  // que o módulo de vendas do Capital Prêmios.

  private async anexarDistribuidorNaVendaSena<T>(venda: T): Promise<T> {
    if (!venda || typeof venda !== 'object') {
      return venda;
    }

    const registro = venda as Record<string, unknown>;

    if (Object.prototype.hasOwnProperty.call(registro, 'distribuidor')) {
      return venda;
    }

    const distribuidorId =
      typeof registro.distribuidorId === 'string'
        ? registro.distribuidorId
        : null;

    if (!distribuidorId) {
      return {
        ...registro,
        distribuidor: null,
      } as T;
    }

    const distribuidor = await this.prisma.distribuidor.findUnique({
      where: { id: distribuidorId },
      select: {
        id: true,
        codigo: true,
        nome: true,
        email: true,
        telefone: true,
      },
    });

    return {
      ...registro,
      distribuidor,
    } as T;
  }

  private async anexarDistribuidorNasVendasSena<T>(vendas: T[]): Promise<T[]> {
    const ids = Array.from(
      new Set(
        vendas
          .map((venda) => {
            if (!venda || typeof venda !== 'object') {
              return null;
            }

            const registro = venda as Record<string, unknown>;
            return typeof registro.distribuidorId === 'string' &&
              !Object.prototype.hasOwnProperty.call(registro, 'distribuidor')
              ? registro.distribuidorId
              : null;
          })
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const distribuidores = ids.length
      ? await this.prisma.distribuidor.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            codigo: true,
            nome: true,
            email: true,
            telefone: true,
          },
        })
      : [];

    const distribuidoresPorId = new Map(
      distribuidores.map((distribuidor) => [distribuidor.id, distribuidor]),
    );

    return vendas.map((venda) => {
      if (!venda || typeof venda !== 'object') {
        return venda;
      }

      const registro = venda as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(registro, 'distribuidor')) {
        return venda;
      }

      const distribuidorId =
        typeof registro.distribuidorId === 'string'
          ? registro.distribuidorId
          : null;

      return {
        ...registro,
        distribuidor: distribuidorId
          ? (distribuidoresPorId.get(distribuidorId) ?? null)
          : null,
      } as T;
    });
  }

  private serializarVenda(venda: {
    id: string;
    edicaoSenaId: string;
    clienteId: string;
    vendedorId: string | null;
    distribuidorId: string | null;
    comboSenaId: string | null;
    quantidade: number;
    total: Prisma.Decimal;
    status: StatusVendaSena;
    tipoPagamento: string;
    gatewayId: string | null;
    createdAt: Date;
    edicaoSena?: {
      id: string;
      numero: string;
      valorCartela: Prisma.Decimal;
    } | null;
    cliente?: { id: string; nome: string; cpf: string } | null;
    vendedor?: { id: string; nome: string; codigo: number } | null;
    cartelas?: {
      id: string;
      numerosEscolhidos: number[];
      setimoNumero: number | null;
      modoSelecao: ModoSelecaoSena;
      status: StatusCartelaSena;
      acertos: number | null;
      setimoAcertou: boolean | null;
    }[];
  }) {
    return {
      ...venda,
      total: venda.total.toString(),
      edicaoSena: venda.edicaoSena
        ? {
            ...venda.edicaoSena,
            valorCartela: venda.edicaoSena.valorCartela.toString(),
          }
        : null,
    };
  }
}
