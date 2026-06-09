import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
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

    const sellerOrigem = await this.resolverSellerOrigem(dto.seller_id);
    dto.vendedorId = sellerOrigem.vendedorId ?? dto.vendedorId;
    dto.distribuidorId = sellerOrigem.distribuidorId ?? dto.distribuidorId;

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

    // 3. Resolver cartelas: explícitas (MANUAL/SURPRESINHA) OU compra rápida
    const cartelas = this.resolverCartelasDaVenda(
      dto.cartelas,
      dto.quantidade,
      quantidadeCombo,
    );

    if (quantidadeCombo !== null && cartelas.length !== quantidadeCombo) {
      const combo = edicao.combos.find((c) => c.id === comboSenaId);
      throw new BadRequestException(
        `O combo "${combo?.nome ?? comboSenaId}" requer exatamente ${quantidadeCombo} cartela(s)`,
      );
    }

    // 4. Buscar ou criar cliente
    const cpfLimpo = dto.cpf.replace(/\D/g, '');
    const cliente = await this.buscarOuCriarCliente(
      cpfLimpo,
      dto.nome,
      dto.telefone,
      dto.dataNascimento,
      dto.email,
      dto.vendedorId,
      dto.distribuidorId,
    );

    // 5. Validar vendedor / distribuidor
    if (dto.vendedorId) {
      const vendedor = await this.prisma.vendedor.findUnique({
        where: { id: dto.vendedorId },
      });
      if (!vendedor) throw new NotFoundException('Vendedor não encontrado');
      if (!dto.distribuidorId) dto.distribuidorId = vendedor.distribuidorId;
    }
    if (dto.distribuidorId) {
      const dist = await this.prisma.distribuidor.findUnique({
        where: { id: dto.distribuidorId },
      });
      if (!dist) throw new NotFoundException('Distribuidor não encontrado');
    }

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

    // 8. Criar venda (MANUAL = imediatamente aprovado com geração do 7º)
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
        const cartelasGeradas = await this.criarCartelasComSetimoNumero(
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
        gatewayPayload: { cartelas } as unknown as Prisma.InputJsonValue,
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
        cpfPagador: cpfLimpo,
        nomePagador: dto.nome,
        emailPagador: dto.email,
        telefonePagador: dto.telefone,
        expiracaoSegundos: PIX_EXPIRACAO_SEGUNDOS,
      });

      await this.prisma.vendaSena.update({
        where: { id: venda.id },
        data: {
          gatewayId: cobranca.gatewayId,
          gatewayPayload: {
            ...((cobranca.payload as Record<string, unknown>) ?? {}),
            cartelas,
          } as Prisma.InputJsonValue,
        },
      });

      dadosPagamento = {
        pixCopiaECola: cobranca.pixCopiaECola,
        qrCodeBase64: cobranca.qrCodeBase64,
        urlPagamento: cobranca.urlPagamento,
      };

      this.logger.log(`Cobrança Sena criada: gatewayId=${cobranca.gatewayId}`);
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
                cartelas,
                erroPagamento: errorMessage,
              } as Prisma.InputJsonValue,
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

    return {
      message: 'Venda Sena criada com sucesso',
      data: {
        ...this.serializarVenda(vendaCompleta!),
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

    // Recuperar cartelas do gatewayPayload
    const payload = (venda.gatewayPayload ?? {}) as Record<string, unknown>;
    const cartelasRaw = (payload['cartelas'] ?? []) as {
      numeros: number[];
      modoSelecao: ModoSelecaoSena;
    }[];

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

      // Criar cartelas com 7º número
      await this.criarCartelasComSetimoNumero(
        tx,
        vendaSenaId,
        venda.edicaoSenaId,
        cartelasRaw,
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

    return buildPaginatedResponse(
      data.map((v) => this.serializarVenda(v)),
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
    return this.serializarVenda(venda);
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

    return buildPaginatedResponse(
      data.map((v) => this.serializarVenda(v)),
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
          const gateway = this.paymentGatewayFactory.getGateway(
            venda.tipoPagamento,
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

  private static readonly MAX_TENTATIVAS_UNICA = 100;
  private static readonly NUMEROS_POR_CARTELA = 6;
  private static readonly NUMERO_MIN = 1;
  private static readonly NUMERO_MAX = 60;

  private resolverCartelasDaVenda(
    cartelas: { numeros?: number[]; modoSelecao: ModoSelecaoSena }[] | undefined,
    quantidade: number | undefined,
    quantidadeCombo: number | null,
  ): { numeros: number[]; modoSelecao: ModoSelecaoSena }[] {
    if (cartelas && cartelas.length > 0) {
      return this.validarEGerarCartelas(cartelas);
    }

    const quantidadeRapida = quantidadeCombo ?? quantidade ?? 0;
    if (quantidadeRapida <= 0) {
      throw new BadRequestException(
        'Informe `cartelas`, `quantidade` ou `comboSenaId` para a compra Sena',
      );
    }

    return this.gerarCartelasCompraRapida(quantidadeRapida);
  }

  private validarEGerarCartelas(
    itens: { numeros?: number[]; modoSelecao: ModoSelecaoSena }[],
  ): { numeros: number[]; modoSelecao: ModoSelecaoSena }[] {
    return itens.map((item) => {
      if (item.modoSelecao === ModoSelecaoSena.SURPRESINHA) {
        return {
          numeros: this.gerarNumerosSurpresinha(),
          modoSelecao: item.modoSelecao,
        };
      }
      if (!item.numeros || item.numeros.length !== VendasSenaService.NUMEROS_POR_CARTELA) {
        throw new BadRequestException(
          'Cartela manual requer exatamente 6 números',
        );
      }
      this.validarNumerosCartela(item.numeros);
      return {
        numeros: [...item.numeros].sort((a, b) => a - b),
        modoSelecao: item.modoSelecao,
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

  private gerarNumerosSurpresinha(): number[] {
    const numeros = new Set<number>();
    while (numeros.size < VendasSenaService.NUMEROS_POR_CARTELA) {
      numeros.add(
        Math.floor(Math.random() * VendasSenaService.NUMERO_MAX) +
          VendasSenaService.NUMERO_MIN,
      );
    }
    return Array.from(numeros).sort((a, b) => a - b);
  }

  /**
   * Compra rápida: gera N cartelas surpresinha tentando maximizar a diferença
   * entre elas. Como C(60,6) = 50.063.860, colisões são raras na prática; mesmo
   * assim, fazemos retry por assinatura única e, no pior caso, aceitamos a
   * duplicidade (regra: cartelas podem ser iguais, mas o sistema deve evitar).
   */
  private gerarCartelasCompraRapida(
    quantidade: number,
  ): { numeros: number[]; modoSelecao: ModoSelecaoSena }[] {
    const assinaturas = new Set<string>();
    const cartelas: { numeros: number[]; modoSelecao: ModoSelecaoSena }[] = [];

    for (let i = 0; i < quantidade; i++) {
      let numeros = this.gerarNumerosSurpresinha();
      let assinatura = numeros.join(',');
      let tentativas = 1;
      while (
        assinaturas.has(assinatura) &&
        tentativas < VendasSenaService.MAX_TENTATIVAS_UNICA
      ) {
        numeros = this.gerarNumerosSurpresinha();
        assinatura = numeros.join(',');
        tentativas++;
      }
      assinaturas.add(assinatura);
      cartelas.push({ numeros, modoSelecao: ModoSelecaoSena.SURPRESINHA });
    }

    return cartelas;
  }

  private gerarSetimoNumero(numerosEscolhidos: number[]): number {
    const set = new Set(numerosEscolhidos);
    let setimo: number;
    do {
      setimo =
        Math.floor(Math.random() * VendasSenaService.NUMERO_MAX) +
        VendasSenaService.NUMERO_MIN;
    } while (set.has(setimo));
    return setimo;
  }

  private async criarCartelasComSetimoNumero(
    tx: PrismaTransactionClient,
    vendaSenaId: string,
    edicaoSenaId: string,
    cartelas: { numeros: number[]; modoSelecao: ModoSelecaoSena }[],
  ) {
    const criadas = await Promise.all(
      cartelas.map((c) =>
        tx.cartelaSena.create({
          data: {
            vendaSenaId,
            edicaoSenaId,
            numerosEscolhidos: c.numeros,
            setimoNumero: this.gerarSetimoNumero(c.numeros),
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

  private async buscarOuCriarCliente(
    cpf: string,
    nome: string,
    telefone: string,
    dataNascimentoInput: string | undefined,
    email?: string,
    vendedorId?: string,
    distribuidorId?: string,
  ) {
    if (!dataNascimentoInput) {
      throw new BadRequestException(
        'dataNascimento é obrigatória para concluir a compra',
      );
    }

    const dataNascimento = parseEValidarDataNascimento(dataNascimentoInput);
    const relacionamentoMaisRecente =
      await this.resolverRelacionamentoMaisRecenteDoCliente(
        vendedorId,
        distribuidorId,
      );
    const existente = await this.prisma.cliente.findUnique({ where: { cpf } });

    if (existente) {
      if (!existente.dataNascimento) {
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
  ): Promise<RelacionamentoClienteMaisRecente> {
    if (vendedorId) {
      const vendedor = await this.prisma.vendedor.findUnique({
        where: { id: vendedorId },
        select: { distribuidorId: true },
      });

      return {
        vendedorId,
        distribuidorId: distribuidorId ?? vendedor?.distribuidorId ?? null,
      };
    }

    if (distribuidorId) {
      return {
        vendedorId: null,
        distribuidorId,
      };
    }

    return {};
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
