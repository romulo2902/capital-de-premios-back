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
  OrigemParticipacao,
  Prisma,
  PrismaClient,
  StatusComissao,
  StatusEdicao,
  StatusVenda,
  TipoCartela,
  TipoPagamento,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';
import { ConfigService } from '@nestjs/config';
import { PaymentGatewayFactory } from '../pagamentos/gateways/payment-gateway.factory';
import { CreateVendaDto } from './dto/create-venda.dto';
import { UpdateVendaStatusDto } from './dto/update-venda-status.dto';
import { UpdateVendaDto } from './dto/update-venda.dto';
import { FiltroVendasDto } from './dto/filtro-vendas.dto';
import {
  VENDA_INCLUDE,
  VENDA_INCLUDE_LISTAGEM_ADMIN,
  VENDA_INCLUDE_DETALHES,
  PIX_EXPIRACAO_SEGUNDOS,
} from './vendas.constants';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import {
  obterQuantidadeCartelas,
  obterTipoCartelaPorQuantidadeCartelas,
} from '../edicoes/edicoes-range.util';
import { criarExcecaoEdicaoEmManutencao } from '../edicoes/edicao-manutencao.util';
import { calcularQuantidadeCartelasDaVenda } from './vendas-quantidade.util';
import { ConfiguracaoComissaoService } from '../configuracao-comissao/configuracao-comissao.service';
import {
  parseEValidarDataNascimento,
  validarMaioridade,
} from '../../common/utils/data-nascimento.util';
import { EmailService } from '../../common/email/email.service';


type ComboVenda = {
  id: string;
  origemParticipacao: OrigemParticipacao;
  tipoCartela: TipoCartela;
  preco: Prisma.Decimal;
  rangeInicio: bigint;
  rangeFinal: bigint;
};

type SetorCombo = {
  rangeInicio: bigint;
  rangeFinal: bigint;
  rangeTotalInicio: bigint;
  rangeTotalFinal: bigint;
};

type MatrizDisponivel = {
  id: string;
  numero: bigint;
  sequenciaBolas: number[];
};

type DirecaoCombo = 'PROXIMO' | 'ANTERIOR';

type ComboSelecionadoPersistido = {
  numeroBase: string;
};

interface ConfiguracaoVendaResolvida {
  combo: ComboVenda;
  tipoCartelaSelecionada: TipoCartela;
  precoCombo: Prisma.Decimal;
  quantidadeCartelas: number;
}

interface RelacionamentoClienteMaisRecente {
  vendedorId?: string | null;
  distribuidorId?: string | null;
}

interface ClienteCompra {
  id: string;
  cpf: string;
  nome: string;
  telefone: string;
  email: string | null;
  dataNascimento: Date | null;
}

interface DadosClientePagamento {
  id: string;
  cpf: string;
  nome: string;
  telefone: string;
  email: string;
}

interface CreateVendaOptions {
  skipGateway?: boolean;
  origemParticipacao?: OrigemParticipacao;
  requireGateway?: boolean;
}

const RECONCILIACAO_POS_COOLDOWN_PADRAO_SEGUNDOS = 300;
const RECONCILIACAO_POS_COOLDOWN_CONFIG_SEGUNDOS = 3600;

@Injectable()
export class VendasService {
  private readonly logger = new Logger(VendasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentGatewayFactory: PaymentGatewayFactory,
    private readonly configuracaoComissaoService: ConfiguracaoComissaoService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  // ─── CREATE ────────────────────────────────────────────

  async create(
    dto: CreateVendaDto,
    user?: RequestUser,
    options?: CreateVendaOptions,
  ) {
    // 1. Validar edição
    const edicao = await this.prisma.edicao.findUnique({
      where: { id: dto.edicaoId },
      select: {
        id: true,
        numero: true,
        status: true,
        manutencaoAtiva: true,
        manutencaoMensagem: true,
        dataEncerramento: true,
        valorCartela: true,
        combos: {
          select: { id: true, origemParticipacao: true, tipoCartela: true, preco: true, rangeInicio: true, rangeFinal: true },
        },
      },
    });

    if (!edicao) {
      throw new NotFoundException('Edição não encontrada');
    }

    if (edicao.status !== StatusEdicao.ATIVA) {
      throw new BadRequestException(
        `A edição ${edicao.numero} não está ativa (status: ${edicao.status})`,
      );
    }

    this.validarEdicaoForaDeManutencao(edicao);

    this.validarJanelaDeVenda(edicao.numero, edicao.dataEncerramento);

    const origemParticipacao =
      options?.origemParticipacao ??
      dto.origemParticipacao ??
      OrigemParticipacao.DIGITAL;
    const quantidadeCartelasSolicitada =
      this.resolverQuantidadeCartelasSolicitada(dto);

    let tipoCartelaSolicitada: TipoCartela | undefined;

    if (dto.comboId) {
      const comboEncontrado = edicao.combos.find((c) => c.id === dto.comboId);
      if (!comboEncontrado) {
        throw new BadRequestException(
          'Combo selecionado não foi encontrado na edição',
        );
      }
      tipoCartelaSolicitada = comboEncontrado.tipoCartela;
    }

    const configuracaoVenda = this.resolverConfiguracaoDaVenda(
      edicao.combos,
      origemParticipacao,
      tipoCartelaSolicitada,
    );

    // 2. Buscar cliente por ID ou criar/resolver pelo CPF legado
    const cliente = dto.clienteId
      ? await this.buscarClientePorIdParaCompra(
          dto.clienteId,
          dto.vendedorId,
          dto.distribuidorId,
        )
      : await this.buscarOuCriarClientePorDto(dto);
    const dadosClientePagamento =
      this.validarDadosClienteParaPagamento(cliente);

    // 3. Validar vendedor e distribuidor se informados
    if (dto.vendedorId) {
      const vendedor = await this.prisma.vendedor.findUnique({
        where: { id: dto.vendedorId },
      });
      if (!vendedor) {
        throw new NotFoundException('Vendedor não encontrado');
      }

      if (!dto.distribuidorId) {
        dto.distribuidorId = vendedor.distribuidorId;
      }
    }

    if (dto.distribuidorId) {
      const distribuidor = await this.prisma.distribuidor.findUnique({
        where: { id: dto.distribuidorId },
      });
      if (!distribuidor) {
        throw new NotFoundException('Distribuidor não encontrado');
      }
    }

    if (dto.cartelasSelecionadas && dto.cartelasSelecionadas.length > 0) {
      if (dto.comboId) {
        throw new BadRequestException(
          'Não é permitido selecionar cartelas explicitamente em compras de combos',
        );
      }
      if (quantidadeCartelasSolicitada !== dto.cartelasSelecionadas.length) {
        throw new BadRequestException(
          'A quantidadeCartelas deve ser igual ao número de cartelasSelecionadas',
        );
      }
    }

    const tipoPagamentoResolvido = this.resolverTipoPagamento(
      dto,
      user,
      options,
    );
    const criadoPorId = this.resolverCriadoPorId(user);

    // 4. Calcular total
    const valorCartela = Number(
      configuracaoVenda.precoCombo ?? edicao.valorCartela,
    );
    const total = valorCartela * quantidadeCartelasSolicitada;

    if (tipoPagamentoResolvido === TipoPagamento.MANUAL) {
      const quantidadeCartelasCompra =
        configuracaoVenda.quantidadeCartelas * quantidadeCartelasSolicitada;
      const resultadoManual = await this.prisma.$transaction(async (tx) => {
        const venda = await tx.venda.create({
          data: {
            edicaoId: dto.edicaoId,
            clienteId: cliente.id,
            vendedorId: dto.vendedorId ?? null,
            distribuidorId: dto.distribuidorId ?? null,
            criadoPorId,
            quantidade: quantidadeCartelasSolicitada,
            tipoCartela: configuracaoVenda.tipoCartelaSelecionada,
            total: new Prisma.Decimal(total.toFixed(2)),
            status: StatusVenda.APROVADO,
            origemParticipacao,
            tipoPagamento: tipoPagamentoResolvido,
            ...(dto.cartelasSelecionadas && dto.cartelasSelecionadas.length > 0
              ? {
                  gatewayPayload: {
                    combosSelecionados: dto.cartelasSelecionadas.map(
                      (numero) => ({ numeroBase: numero }),
                    ),
                  } as unknown as Prisma.InputJsonValue,
                }
              : {}),
          },
          include: {
            edicao: true,
            vendedor: true,
          },
        });

        return this.processarAprovacaoDaVenda(tx, venda, {
          origem: 'ADMIN',
          tipoPagamento: TipoPagamento.MANUAL,
          confirmadoEm: new Date().toISOString(),
        });
      });

      this.logger.log(
        `Venda manual ${resultadoManual.vendaAtualizada.id} criada e aprovada — ${quantidadeCartelasCompra} cartela(s) — R$ ${total.toFixed(2)}`,
      );
      void this.enviarEmailCompraAprovada(resultadoManual.vendaAtualizada.id);
      const vendaManualComDistribuidor = await this.anexarDistribuidorNaVenda(
        resultadoManual.vendaAtualizada,
      );

      return {
        message: 'Venda criada com sucesso',
        data: this.serializarVendaParaResposta(vendaManualComDistribuidor),
      };
    }

    // 5. Criar venda com status PENDENTE
    const venda = await this.prisma.venda.create({
      data: {
        edicaoId: dto.edicaoId,
        clienteId: cliente.id,
        vendedorId: dto.vendedorId ?? null,
        distribuidorId: dto.distribuidorId ?? null,
        criadoPorId,
        quantidade: quantidadeCartelasSolicitada,
        tipoCartela: configuracaoVenda.tipoCartelaSelecionada,
        total: new Prisma.Decimal(total.toFixed(2)),
        status: StatusVenda.PENDENTE,
        origemParticipacao,
        tipoPagamento: tipoPagamentoResolvido,
        ...(dto.cartelasSelecionadas && dto.cartelasSelecionadas.length > 0
          ? {
              gatewayPayload: {
                combosSelecionados: dto.cartelasSelecionadas.map((numero) => ({
                  numeroBase: numero,
                })),
              } as unknown as Prisma.InputJsonValue,
            }
          : {}),
      },
      include: VENDA_INCLUDE,
    });

    const quantidadeCartelasCompra =
      configuracaoVenda.quantidadeCartelas * quantidadeCartelasSolicitada;

    this.logger.log(
      `Venda ${venda.id} criada — ${quantidadeCartelasCompra} cartela(s) — R$ ${total.toFixed(2)} — ${tipoPagamentoResolvido}`,
    );

    // 6. Criar cobrança no gateway de pagamento
    //
    // No canal POS o pagamento é processado externamente pela maquininha; a venda
    // permanece PENDENTE e é confirmada depois via confirmarPagamento (skipGateway).
    let dadosPagamento: {
      pixCopiaECola?: string;
      qrCodeBase64?: string;
      urlPagamento?: string;
    } = {};

    if (!options?.skipGateway) {
      try {
      const gateway = this.paymentGatewayFactory.getGateway(
        tipoPagamentoResolvido,
      );
      const cobranca = await gateway.criarCobranca({
        vendaId: venda.id,
        valorCentavos: Math.round(total * 100),
        quantidadeItens: quantidadeCartelasSolicitada,
        valorUnitarioCentavos: Math.round(valorCartela * 100),
        descricao: `Capital de Prêmios — Edição ${edicao.numero} — ${quantidadeCartelasCompra} cartela(s)`,
        cpfPagador: dadosClientePagamento.cpf,
        nomePagador: dadosClientePagamento.nome,
        emailPagador: dadosClientePagamento.email,
        telefonePagador: dadosClientePagamento.telefone,
        expiracaoSegundos: PIX_EXPIRACAO_SEGUNDOS,
      });

      // Atualizar venda com dados do gateway
      await this.prisma.venda.update({
        where: { id: venda.id },
        data: {
          gatewayId: cobranca.gatewayId,
          gatewayPayload: {
            ...((cobranca.payload as Record<string, unknown>) ?? {}),
            ...(dto.cartelasSelecionadas && dto.cartelasSelecionadas.length > 0
              ? {
                  combosSelecionados: dto.cartelasSelecionadas.map(
                    (numero) => ({ numeroBase: numero }),
                  ),
                }
              : {}),
          } as Prisma.InputJsonValue,
        },
      });

      dadosPagamento = {
        pixCopiaECola: cobranca.pixCopiaECola,
        qrCodeBase64: cobranca.qrCodeBase64,
        urlPagamento: cobranca.urlPagamento,
      };

      this.logger.log(
        `Cobrança criada no gateway: gatewayId=${cobranca.gatewayId}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Erro ao criar cobrança no gateway para venda ${venda.id}: ${errorMessage}`,
      );

      if (options?.requireGateway) {
        await this.prisma.venda.update({
          where: { id: venda.id },
          data: {
            status: StatusVenda.RECUSADO,
            gatewayPayload: {
              erroPagamento: errorMessage,
            } as Prisma.InputJsonValue,
          },
        });
        throw new BadGatewayException(
          'Não foi possível processar o pagamento. Tente novamente.',
        );
      }

      // Venda fica como PENDENTE mesmo sem cobrança no gateway
      // O admin pode reprocessar ou cancelar manualmente
      }
    }

    // 7. Retornar venda + dados de pagamento
    const vendaCompleta = await this.prisma.venda.findUnique({
      where: { id: venda.id },
      include: VENDA_INCLUDE,
    });

    if (!vendaCompleta) {
      throw new NotFoundException('Venda não encontrada após criação');
    }
    const vendaCompletaComDistribuidor =
      await this.anexarDistribuidorNaVenda(vendaCompleta);

    return {
      message: 'Venda criada com sucesso',
      data: {
        ...this.serializarVendaParaResposta(vendaCompletaComDistribuidor),
        pagamento: dadosPagamento,
      },
    };
  }

  async listarCombosDisponiveis(params: {
    edicaoId: string;
    origemParticipacao?: OrigemParticipacao;
    tipoCartela?: TipoCartela;
    quantidadeCartelas?: number;
    cursorNumeroBase?: string;
    direcao?: DirecaoCombo;
    limit?: number;
    indiceRange?: number;
    numerosReservados?: string[];
  }) {
    const edicao = await this.prisma.edicao.findUnique({
      where: { id: params.edicaoId },
      select: {
        id: true,
        numero: true,
        status: true,
        manutencaoAtiva: true,
        manutencaoMensagem: true,
        dataEncerramento: true,
        valorCartela: true,
        combos: {
          select: { id: true, origemParticipacao: true, tipoCartela: true, preco: true, rangeInicio: true, rangeFinal: true },
          orderBy: [{ origemParticipacao: 'asc' }, { tipoCartela: 'asc' }],
        },
      },
    });

    if (!edicao) {
      throw new NotFoundException('Edição não encontrada');
    }

    if (edicao.status !== StatusEdicao.ATIVA) {
      throw new BadRequestException('Edição não está ativa para navegação');
    }

    this.validarEdicaoForaDeManutencao(edicao);

    this.validarJanelaDeVenda(edicao.numero, edicao.dataEncerramento);

    const origemParticipacao =
      params.origemParticipacao ?? OrigemParticipacao.DIGITAL;
    const tipoCartelaSolicitada = this.resolverTipoCartelaDaSolicitacao(
      params.tipoCartela,
      params.quantidadeCartelas,
    );

    let configuracaoVenda: ConfiguracaoVendaResolvida;
    try {
      configuracaoVenda = this.resolverConfiguracaoDaVenda(
        edicao.combos,
        origemParticipacao,
        tipoCartelaSolicitada,
      );
    } catch (e) {
      if (e instanceof BadRequestException) {
        return {
          message: 'Nenhum combo configurado para esta seleção',
          data: {
            edicaoId: edicao.id,
            edicaoNumero: edicao.numero,
            status: edicao.status,
            origemParticipacao,
            tipoCompra:
              (tipoCartelaSolicitada ?? TipoCartela.UMA_CHANCE) ===
              TipoCartela.UMA_CHANCE
                ? 'UNITARIO'
                : 'COMBO',
            quantidadeCartelas: 0,
            valorUnitarioCartela: this.formatarValorMonetario(edicao.valorCartela),
            valorCombo: null,
            preco: null,
            passoEntreCartelas: '0',
            rangeTotalInicio: '0',
            rangeTotalFinal: '0',
            setores: [],
            cursorNumeroBaseAtual: null,
            combos: [],
            comboAtual: null,
          },
        };
      }
      throw e;
    }

    const quantidadeCartelas = configuracaoVenda.quantidadeCartelas;
    const comboRange = configuracaoVenda.combo;
    const setores = this.expandirSetoresDoCombo(comboRange, quantidadeCartelas);
    const primeiroSetor = setores[0];
    const segundoSetor = setores[1];
    const quantidadeCombosParaListar =
      params.limit && params.limit > 0 ? params.limit : 1;

    const grupos = await this.selecionarGruposDisponiveisParaVenda(
      this.prisma,
      edicao.id,
      comboRange,
      quantidadeCartelas,
      quantidadeCombosParaListar,
      {
        cursorNumeroBase: params.cursorNumeroBase
          ? BigInt(params.cursorNumeroBase)
          : undefined,
        direcao: params.direcao ?? 'PROXIMO',
        strict: false,
        numerosReservadosAEvitar: params.numerosReservados,
      },
    );

    const combos = grupos.map((grupo, index) => ({
      ordemSequencia: index + 1,
      numeroBase: grupo[0] ? this.formatarNumeroBilhete(grupo[0].numero) : null,
      bilhetes: grupo.map((bilhete, bilheteIndex) => ({
        ordem: bilheteIndex + 1,
        matrizId: bilhete.id,
        numero: this.formatarNumeroBilhete(bilhete.numero),
        sequenciaBolas: bilhete.sequenciaBolas,
      })),
    }));

    const primeiroCombo = combos[0];
    const comboAtual =
      primeiroCombo && primeiroCombo.numeroBase
        ? { numeroBase: primeiroCombo.numeroBase, bilhetes: primeiroCombo.bilhetes }
        : null;

    return {
      message: 'Combos disponíveis listados com sucesso',
      data: {
        edicaoId: edicao.id,
        edicaoNumero: edicao.numero,
        status: edicao.status,
        origemParticipacao,
        tipoCompra:
          configuracaoVenda.tipoCartelaSelecionada === TipoCartela.UMA_CHANCE
            ? 'UNITARIO'
            : 'COMBO',
        quantidadeCartelas,
        valorUnitarioCartela: this.formatarValorMonetario(edicao.valorCartela),
        valorCombo: this.formatarValorMonetario(configuracaoVenda.precoCombo),
        preco: this.formatarValorMonetario(configuracaoVenda.precoCombo),
        passoEntreCartelas:
          primeiroSetor && segundoSetor
            ? (segundoSetor.rangeInicio - primeiroSetor.rangeInicio).toString()
            : '0',
        rangeTotalInicio: primeiroSetor?.rangeTotalInicio.toString() ?? '0',
        rangeTotalFinal: primeiroSetor?.rangeTotalFinal.toString() ?? '0',
        setores: setores.map((setor, i) => ({
          indiceCartela: i + 1,
          rangeInicio: setor.rangeInicio.toString(),
          rangeFinal: setor.rangeFinal.toString(),
        })),
        cursorNumeroBaseAtual: comboAtual?.numeroBase ?? null,
        combos,
        comboAtual,
      },
    };
  }

  // ─── FIND ALL ──────────────────────────────────────────

  async findAll(
    page = 1,
    limit = 20,
    filtros?: FiltroVendasDto,
    user?: RequestUser,
  ) {
    const pagination = normalizePagination(page, limit);
    const where = this.mergeWhere(
      this.buildWhereFromFiltros(filtros),
      this.buildHierarchyWhere(user),
    );
    const include =
      user?.perfil === 'ADMIN' ? VENDA_INCLUDE_LISTAGEM_ADMIN : VENDA_INCLUDE;

    const [data, total] = await Promise.all([
      this.prisma.venda.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include,
      }),
      this.prisma.venda.count({ where }),
    ]);
    const vendasComDistribuidor = await this.anexarDistribuidorNasVendas(data);

    return buildPaginatedResponse(
      vendasComDistribuidor.map((venda) =>
        this.serializarVendaParaResposta(venda),
      ),
      total,
      pagination.page,
      pagination.limit,
      {
        successMessage: 'Vendas listadas com sucesso',
        emptyMessage: 'Nenhuma venda encontrada',
      },
    );
  }

  // ─── FIND ONE ──────────────────────────────────────────

  async findOne(id: string, user?: RequestUser) {
    const venda = await this.buscarVendaComContextoEdicao(id, user);
    const vendaSincronizada = await this.sincronizarVendaPosPendente(
      venda,
      VENDA_INCLUDE_DETALHES,
    );

    return {
      message: 'Venda encontrada com sucesso',
      data: this.serializarVendaParaResposta(
        await this.anexarDistribuidorNaVenda(vendaSincronizada),
      ),
    };
  }

  async consultarStatus(id: string, user?: RequestUser) {
    const venda = await this.buscarVendaComContextoEdicao(id, user);
    const vendaSincronizada = await this.sincronizarVendaPosPendente(
      venda,
      VENDA_INCLUDE_DETALHES,
    );
    const vendaComDistribuidor =
      await this.anexarDistribuidorNaVenda(vendaSincronizada);

    return {
      message: 'Status da venda consultado com sucesso',
      data: this.serializarVendaParaResposta(vendaComDistribuidor),
    };
  }

  async reconciliarVendasPosPendentes(
    limite = 20,
    janelaMinutos = 60,
  ): Promise<number> {
    const createdAtGte = new Date(Date.now() - janelaMinutos * 60 * 1000);

    const vendasPendentes = await this.prisma.venda.findMany({
      where: {
        origemParticipacao: OrigemParticipacao.POS,
        status: StatusVenda.PENDENTE,
        gatewayId: { not: null },
        createdAt: { gte: createdAtGte },
      },
      select: {
        id: true,
        status: true,
        origemParticipacao: true,
        tipoPagamento: true,
        gatewayId: true,
        gatewayPayload: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limite * 3,
    });

    let confirmadas = 0;
    const agora = new Date();
    const vendasElegiveis = vendasPendentes
      .filter((venda) => !this.estaEmCooldownDeReconciliacao(venda, agora))
      .slice(0, limite);

    for (const venda of vendasElegiveis) {
      const vendaSincronizada = await this.sincronizarVendaPosPendente(
        venda,
        VENDA_INCLUDE,
      );

      if (
        venda.status === StatusVenda.PENDENTE &&
        vendaSincronizada.status === StatusVenda.APROVADO
      ) {
        confirmadas += 1;
      }
    }

    return confirmadas;
  }

  async update(id: string, dto: UpdateVendaDto, user?: RequestUser) {
    const venda = await this.prisma.venda.findFirst({
      where: this.mergeWhere({ id }, this.buildHierarchyWhere(user)),
      select: {
        id: true,
        clienteId: true,
      },
    });

    if (!venda) {
      throw new NotFoundException('Venda não encontrada');
    }

    const clienteUpdateData = this.normalizarDadosClienteParaEdicao(dto);

    if (Object.keys(clienteUpdateData).length === 0) {
      throw new BadRequestException(
        'Informe ao menos um campo editável dos dados pessoais da venda',
      );
    }

    await this.prisma.cliente.update({
      where: { id: venda.clienteId },
      data: clienteUpdateData,
    });

    const vendaAtualizada = await this.buscarVendaComContextoEdicao(id, user);
    const vendaAtualizadaComDistribuidor =
      await this.anexarDistribuidorNaVenda(vendaAtualizada);

    this.logger.log(`Venda ${id} atualizada com sucesso`);

    return {
      message: 'Venda atualizada com sucesso',
      data: this.serializarVendaParaResposta(vendaAtualizadaComDistribuidor),
    };
  }

  // ─── FIND BY CLIENTE CPF ──────────────────────────────

  async findByCliente(
    cpf: string,
    page = 1,
    limit = 20,
    user?: RequestUser,
  ) {
    const cpfLimpo = cpf.replace(/\D/g, '');
    const pagination = normalizePagination(page, limit);

    const clienteWhere: Prisma.ClienteWhereInput =
      user?.perfil === 'DISTRIBUIDOR'
        ? {
            cpf: cpfLimpo,
            distribuidorId: user.distribuidorId,
          }
        : user?.perfil === 'VENDEDOR'
          ? {
              cpf: cpfLimpo,
              vendedorId: user.vendedorId,
            }
          : { cpf: cpfLimpo };

    const cliente = await this.prisma.cliente.findFirst({
      where: clienteWhere,
      select: { id: true },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente não encontrado');
    }

    const where = this.mergeWhere(
      { clienteId: cliente.id },
      this.buildHierarchyWhere(user),
    );

    const [data, total] = await Promise.all([
      this.prisma.venda.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: VENDA_INCLUDE,
      }),
      this.prisma.venda.count({ where }),
    ]);
    const vendasComDistribuidor = await this.anexarDistribuidorNasVendas(data);

    return buildPaginatedResponse(
      vendasComDistribuidor.map((venda) =>
        this.serializarVendaParaResposta(venda),
      ),
      total,
      pagination.page,
      pagination.limit,
      {
        successMessage: 'Vendas do cliente listadas com sucesso',
        emptyMessage: 'Nenhuma venda encontrada para este cliente',
      },
    );
  }

  // ─── CONFIRMAR PAGAMENTO ──────────────────────────────

  async confirmarPagamento(
    vendaId: string,
    gatewayPayload?: Record<string, unknown>,
  ) {
    const venda = await this.prisma.venda.findUnique({
      where: { id: vendaId },
      include: {
        edicao: true,
        vendedor: true,
      },
    });

    if (!venda) {
      throw new NotFoundException('Venda não encontrada');
    }

    if (venda.status !== StatusVenda.PENDENTE) {
      throw new ConflictException(
        `Venda já processada (status: ${venda.status})`,
      );
    }

    const resultado = await this.prisma.$transaction((tx) =>
      this.processarAprovacaoDaVenda(tx, venda, gatewayPayload),
    );

    this.logger.log(
      `Pagamento confirmado para venda ${vendaId} — ${resultado.bilhetesAlocados} bilhetes alocados`,
    );
    const vendaComDistribuidor = await this.anexarDistribuidorNaVenda(
      resultado.vendaAtualizada,
    );

    return {
      message: 'Pagamento confirmado com sucesso',
      data: this.serializarVendaParaResposta(vendaComDistribuidor),
    };
  }

  // ─── CANCELAR ──────────────────────────────────────────

  async cancelar(id: string, motivo?: string) {
    const venda = await this.prisma.venda.findUnique({
      where: { id },
      include: { bilhetes: true, comissao: true, vendedor: true },
    });

    if (!venda) {
      throw new NotFoundException('Venda não encontrada');
    }

    if (venda.status === StatusVenda.CANCELADO) {
      throw new ConflictException('Venda já está cancelada');
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Liberar bilhetes (deletar — MatrizRange não tem flag disponivel, rastreio é via Bilhete)
      if (venda.bilhetes.length > 0) {
        await tx.bilhete.deleteMany({
          where: { vendaId: venda.id },
        });
      }

      // 2. Reverter comissão se houver
      if (venda.comissao && venda.vendedorId) {
        await tx.vendedor.update({
          where: { id: venda.vendedorId },
          data: {
            saldo: {
              decrement: venda.comissao.valor,
            },
          },
        });

        await tx.comissao.delete({
          where: { id: venda.comissao.id },
        });
      }

      // 3. Cancelar cobrança no gateway
      if (venda.gatewayId) {
        try {
          const gateway = this.paymentGatewayFactory.getGatewayParaConsulta(
            venda.tipoPagamento,
            venda.gatewayPayload,
          );
          await gateway.cancelarCobranca(venda.gatewayId);
        } catch (error) {
          this.logger.warn(
            `Erro ao cancelar cobrança no gateway: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // 4. Atualizar status da venda
      await tx.venda.update({
        where: { id: venda.id },
        data: {
          status: StatusVenda.CANCELADO,
          gatewayPayload: {
            ...((venda.gatewayPayload as Record<string, unknown>) ?? {}),
            motivoCancelamento: motivo ?? 'Cancelado pelo administrador',
            canceladoEm: new Date().toISOString(),
          },
        },
      });
    });

    this.logger.log(`Venda ${id} cancelada. Motivo: ${motivo ?? 'N/A'}`);

    const vendaAtualizada = await this.prisma.venda.findUnique({
      where: { id },
      include: VENDA_INCLUDE,
    });
    const vendaAtualizadaComDistribuidor =
      await this.anexarDistribuidorNaVenda(vendaAtualizada);

    return {
      message: 'Venda cancelada com sucesso',
      data: this.serializarVendaParaResposta(vendaAtualizadaComDistribuidor),
    };
  }

  // ─── ATUALIZAR STATUS (MANUAL) ────────────────────────

  async atualizarStatus(id: string, dto: UpdateVendaStatusDto) {
    const venda = await this.prisma.venda.findUnique({
      where: { id },
    });

    if (!venda) {
      throw new NotFoundException('Venda não encontrada');
    }

    // Validar transições permitidas
    this.validarTransicaoStatus(venda.status, dto.status);

    if (dto.status === StatusVenda.CANCELADO) {
      return this.cancelar(id, dto.motivo);
    }

    if (
      dto.status === StatusVenda.APROVADO &&
      venda.status === StatusVenda.PENDENTE
    ) {
      return this.confirmarPagamento(id);
    }

    const vendaAtualizada = await this.prisma.venda.update({
      where: { id },
      data: { status: dto.status },
      include: VENDA_INCLUDE,
    });
    const vendaAtualizadaComDistribuidor =
      await this.anexarDistribuidorNaVenda(vendaAtualizada);

    this.logger.log(`Status da venda ${id} alterado para ${dto.status}`);

    return {
      message: 'Status da venda atualizado com sucesso',
      data: this.serializarVendaParaResposta(vendaAtualizadaComDistribuidor),
    };
  }

  // ─── HELPERS PRIVADOS ─────────────────────────────────

  private async processarAprovacaoDaVenda(
    tx: Prisma.TransactionClient,
    venda: {
      id: string;
      edicaoId: string;
      quantidade: number;
      origemParticipacao: OrigemParticipacao;
      tipoCartela?: TipoCartela | null;
      gatewayPayload?: Prisma.JsonValue | null;
      distribuidorId?: string | null;
      vendedorId?: string | null;
      vendedor?: { comissaoPercent: Prisma.Decimal } | null;
      total: Prisma.Decimal;
    },
    gatewayPayload?: Record<string, unknown>,
  ) {
    const bilhetesAlocados = await this.alocarBilhetes(tx, venda);

    if (venda.distribuidorId) {
      const distribuidor = await tx.distribuidor.findUnique({
        where: { id: venda.distribuidorId },
        select: { comissaoPercent: true },
      });
      if (distribuidor) {
        // Busca configuração global (usada como fallback quando o percentual individual é 0)
        const configGlobal =
          await this.configuracaoComissaoService.obterConfiguracaoGlobal();

        const distPercentIndividual = Number(distribuidor.comissaoPercent);
        const distPercent =
          distPercentIndividual > 0
            ? distPercentIndividual
            : configGlobal.percentualDistribuidor;

        const totalVenda = Number(venda.total);

        // ── Comissão do Vendedor ──────────────────────────────────────────
        // Aplicada diretamente sobre o total da venda (percentual fixo e independente)
        if (venda.vendedorId && venda.vendedor) {
          const vendPercentIndividual =
            Number(venda.vendedor.comissaoPercent) || 0;
          const vendPercent =
            vendPercentIndividual > 0
              ? vendPercentIndividual
              : configGlobal.percentualVendedor;

          const comissaoVendedor = totalVenda * (vendPercent / 100);

          if (comissaoVendedor > 0) {
            await tx.comissao.create({
              data: {
                vendedorId: venda.vendedorId,
                vendaId: venda.id,
                valor: new Prisma.Decimal(comissaoVendedor.toFixed(2)),
                status: StatusComissao.PENDENTE,
              },
            });

            await tx.vendedor.update({
              where: { id: venda.vendedorId },
              data: {
                saldo: {
                  increment: new Prisma.Decimal(comissaoVendedor.toFixed(2)),
                },
              },
            });

            this.logger.log(
              `Comissão Vendedor ${vendPercent}% (R$ ${comissaoVendedor.toFixed(2)}) creditada -> ${venda.vendedorId}`,
            );
          }
        }

        // ── Comissão do Distribuidor ──────────────────────────────────────
        // Aplicada diretamente sobre o total da venda (percentual fixo e independente)
        const comissaoDistribuidor = totalVenda * (distPercent / 100);

        if (comissaoDistribuidor > 0) {
          await tx.comissaoDistribuidor.create({
            data: {
              distribuidorId: venda.distribuidorId,
              vendaId: venda.id,
              valor: new Prisma.Decimal(comissaoDistribuidor.toFixed(2)),
              status: StatusComissao.PENDENTE,
            },
          });

          await tx.distribuidor.update({
            where: { id: venda.distribuidorId },
            data: {
              saldo: {
                increment: new Prisma.Decimal(comissaoDistribuidor.toFixed(2)),
              },
            },
          });

          this.logger.log(
            `Comissão Distribuidor ${distPercent}% (R$ ${comissaoDistribuidor.toFixed(2)}) creditada -> ${venda.distribuidorId}`,
          );
        }
      }
    }

    const vendaAtualizada = await tx.venda.update({
      where: { id: venda.id },
      data: {
        status: StatusVenda.APROVADO,
        ...(gatewayPayload
          ? { gatewayPayload: gatewayPayload as Prisma.InputJsonValue }
          : {}),
      },
      include: VENDA_INCLUDE_DETALHES,
    });

    return { vendaAtualizada, bilhetesAlocados };
  }

  private async buscarVendaComContextoEdicao(id: string, user?: RequestUser) {
    const venda = await this.prisma.venda.findFirst({
      where: this.mergeWhere({ id }, this.buildHierarchyWhere(user)),
      include: VENDA_INCLUDE_DETALHES,
    });

    if (!venda) {
      throw new NotFoundException('Venda não encontrada');
    }

    if (!venda.distribuidorId) {
      return {
        ...venda,
        distribuidor: null,
      };
    }

    const distribuidor = await this.prisma.distribuidor.findUnique({
      where: { id: venda.distribuidorId },
      select: {
        id: true,
        codigo: true,
        nome: true,
        email: true,
        telefone: true,
      },
    });

    return {
      ...venda,
      distribuidor,
    };
  }

  private async anexarDistribuidorNaVenda<T>(venda: T): Promise<T> {
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

  private async anexarDistribuidorNasVendas<T>(vendas: T[]): Promise<T[]> {
    if (vendas.length === 0) {
      return vendas;
    }

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

    if (ids.length === 0) {
      return vendas.map((venda) => {
        if (!venda || typeof venda !== 'object') {
          return venda;
        }

        const registro = venda as Record<string, unknown>;
        if (Object.prototype.hasOwnProperty.call(registro, 'distribuidor')) {
          return venda;
        }

        return {
          ...registro,
          distribuidor: null,
        } as T;
      });
    }

    const distribuidores = await this.prisma.distribuidor.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        codigo: true,
        nome: true,
        email: true,
        telefone: true,
      },
    });

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
          ? distribuidoresPorId.get(distribuidorId) ?? null
          : null,
      } as T;
    });
  }

  private async sincronizarVendaPosPendente<
    T extends {
      id: string;
      status?: StatusVenda;
      origemParticipacao?: OrigemParticipacao;
      tipoPagamento?: TipoPagamento;
      gatewayId?: string | null;
      gatewayPayload?: Prisma.JsonValue | null;
    },
  >(venda: T, include: Prisma.VendaInclude): Promise<T> {
    if (
      venda.status !== StatusVenda.PENDENTE ||
      venda.origemParticipacao !== OrigemParticipacao.POS ||
      !venda.gatewayId ||
      !venda.tipoPagamento
    ) {
      return venda;
    }

    try {
      const gateway = this.paymentGatewayFactory.getGatewayParaConsulta(
        venda.tipoPagamento,
        venda.gatewayPayload,
      );
      const cobranca = await gateway.consultarCobranca(venda.gatewayId);

      if (cobranca.status !== 'APROVADO') {
        return venda;
      }

      await this.confirmarPagamento(venda.id, {
        gatewayPolling: cobranca.payload,
        confirmadoEm:
          cobranca.paidAt?.toISOString() ?? new Date().toISOString(),
      });
      await this.registrarSucessoReconciliacaoPos(venda.id, venda.gatewayPayload);

      const vendaAtualizada = await this.prisma.venda.findUnique({
        where: { id: venda.id },
        include,
      });

      return (vendaAtualizada as T | null) ?? venda;
    } catch (error) {
      if (!(error instanceof ConflictException)) {
        await this.registrarFalhaReconciliacaoPos(
          venda.id,
          venda.gatewayPayload,
          error,
        );
        this.logger.warn(
          `Falha ao sincronizar venda POS ${venda.id} com o gateway: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      const vendaAtualizada = await this.prisma.venda.findUnique({
        where: { id: venda.id },
        include,
      });

      return (vendaAtualizada as T | null) ?? venda;
    }
  }

  private estaEmCooldownDeReconciliacao(
    venda: { gatewayPayload?: Prisma.JsonValue | null },
    agora: Date,
  ): boolean {
    const payload = this.gatewayPayloadAsObject(venda.gatewayPayload);
    const ultimaFalha = this.objetoSeguro(payload?.ultimaFalhaReconciliacao);
    const proximaTentativaEm = ultimaFalha?.proximaTentativaEm;

    if (typeof proximaTentativaEm !== 'string') {
      return false;
    }

    const data = new Date(proximaTentativaEm);
    return !Number.isNaN(data.getTime()) && data > agora;
  }

  private async registrarFalhaReconciliacaoPos(
    vendaId: string,
    gatewayPayload: Prisma.JsonValue | null | undefined,
    error: unknown,
  ): Promise<void> {
    const payloadAtual = this.gatewayPayloadAsObject(gatewayPayload) ?? {};
    const mensagem = error instanceof Error ? error.message : String(error);
    const cooldownSegundos = this.obterCooldownReconciliacaoPos(mensagem);
    const agora = new Date();
    const proximaTentativa = new Date(agora.getTime() + cooldownSegundos * 1000);

    await this.prisma.venda.update({
      where: { id: vendaId },
      data: {
        gatewayPayload: {
          ...payloadAtual,
          ultimaFalhaReconciliacao: {
            mensagem,
            cooldownSegundos,
            falhouEm: agora.toISOString(),
            proximaTentativaEm: proximaTentativa.toISOString(),
          },
        } as Prisma.InputJsonValue,
      },
    });
  }

  private async registrarSucessoReconciliacaoPos(
    vendaId: string,
    gatewayPayload: Prisma.JsonValue | null | undefined,
  ): Promise<void> {
    const payloadAtual = this.gatewayPayloadAsObject(gatewayPayload) ?? {};
    const { ultimaFalhaReconciliacao: _ultimaFalhaReconciliacao, ...restante } =
      payloadAtual;

    await this.prisma.venda.update({
      where: { id: vendaId },
      data: {
        gatewayPayload: {
          ...restante,
          ultimaReconciliacaoSucessoEm: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
  }

  private obterCooldownReconciliacaoPos(mensagem: string): number {
    const mensagemNormalizada = mensagem.toLowerCase();

    if (
      mensagemNormalizada.includes('edição sem ranges configurados') ||
      mensagemNormalizada.includes('não possui range base') ||
      mensagemNormalizada.includes('não há cartelas suficientes')
    ) {
      return RECONCILIACAO_POS_COOLDOWN_CONFIG_SEGUNDOS;
    }

    return RECONCILIACAO_POS_COOLDOWN_PADRAO_SEGUNDOS;
  }

  private gatewayPayloadAsObject(
    gatewayPayload: Prisma.JsonValue | null | undefined,
  ): Record<string, unknown> | null {
    if (
      !gatewayPayload ||
      typeof gatewayPayload !== 'object' ||
      Array.isArray(gatewayPayload)
    ) {
      return null;
    }

    return gatewayPayload as Record<string, unknown>;
  }

  private objetoSeguro(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private normalizarDadosClienteParaEdicao(
    dto: UpdateVendaDto,
  ): Prisma.ClienteUpdateInput {
    const data: Prisma.ClienteUpdateInput = {};

    if (dto.nome !== undefined) {
      data.nome = this.normalizarTextoObrigatorio(dto.nome, 'nome');
    }

    if (dto.telefone !== undefined) {
      data.telefone = this.normalizarTextoObrigatorio(dto.telefone, 'telefone');
    }

    if (dto.dataNascimento !== undefined) {
      const valorNormalizado = dto.dataNascimento.trim();
      data.dataNascimento = valorNormalizado
        ? parseEValidarDataNascimento(valorNormalizado, {
            allowBrazilianFormat: true,
          })
        : null;
    }

    if (dto.cep !== undefined) {
      data.cep = this.normalizarTextoOpcional(dto.cep);
    }

    if (dto.endereco !== undefined) {
      data.endereco = this.normalizarTextoOpcional(dto.endereco);
    }

    if (dto.numero !== undefined) {
      data.numero = this.normalizarTextoOpcional(dto.numero);
    }

    if (dto.bairro !== undefined) {
      data.bairro = this.normalizarTextoOpcional(dto.bairro);
    }

    if (dto.cidade !== undefined) {
      data.cidade = this.normalizarTextoOpcional(dto.cidade);
    }

    if (dto.estado !== undefined) {
      const estadoNormalizado = this.normalizarTextoOpcional(dto.estado);
      data.estado = estadoNormalizado ? estadoNormalizado.toUpperCase() : null;
    }

    if (dto.email !== undefined) {
      const emailNormalizado = this.normalizarTextoOpcional(dto.email);
      data.email = emailNormalizado ? emailNormalizado.toLowerCase() : null;
    }

    return data;
  }

  private serializarVendaParaResposta<T>(venda: T): T {
    if (!venda || typeof venda !== 'object') {
      return venda;
    }

    const serializado = this.serializarBigIntRecursivo(venda);
    const comQuantidadeNormalizada =
      this.normalizarQuantidadeCartelasNaResposta(serializado);

    return this.adicionarValoresFormatadosNaResposta(
      comQuantidadeNormalizada,
    ) as T;
  }

  private normalizarQuantidadeCartelasNaResposta(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) =>
        this.normalizarQuantidadeCartelasNaResposta(item),
      );
    }

    if (value instanceof Date) {
      return value;
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    const registro = value as Record<string, unknown>;
    const registroNormalizado = Object.fromEntries(
      Object.entries(registro).map(([key, entryValue]) => [
        key,
        this.normalizarQuantidadeCartelasNaResposta(entryValue),
      ]),
    ) as Record<string, unknown>;
    const quantidade =
      typeof registroNormalizado.quantidade === 'number'
        ? registroNormalizado.quantidade
        : null;

    if (quantidade === null) {
      return registroNormalizado;
    }

    const tipoCartela =
      typeof registroNormalizado.tipoCartela === 'string'
        ? (registroNormalizado.tipoCartela as TipoCartela)
        : null;
    const bilhetes = Array.isArray(registroNormalizado.bilhetes)
      ? registroNormalizado.bilhetes
      : null;
    const countBilhetes =
      registroNormalizado._count &&
      typeof registroNormalizado._count === 'object' &&
      typeof (registroNormalizado._count as Record<string, unknown>)
        .bilhetes === 'number'
        ? ((registroNormalizado._count as Record<string, unknown>)
            .bilhetes as number)
        : null;
    const quantidadeBilhetes =
      bilhetes && bilhetes.length > 0
        ? bilhetes.length
        : countBilhetes && countBilhetes > 0
          ? countBilhetes
          : null;
    const quantidadeCartelasPorCombo =
      this.obterQuantidadeCartelasDaVenda(tipoCartela);
    const quantidadeCartelas = calcularQuantidadeCartelasDaVenda({
      quantidade,
      tipoCartela,
      quantidadeBilhetes,
    });
    const registroSemTipoCartela = { ...registroNormalizado };
    delete registroSemTipoCartela.tipoCartela;

    return {
      ...registroSemTipoCartela,
      quantidade: quantidadeCartelas,
      quantidadeCombos: quantidade,
      quantidadeCartelasPorCombo,
      quantidadeCartelas,
    };
  }

  private adicionarValoresFormatadosNaResposta(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) =>
        this.adicionarValoresFormatadosNaResposta(item),
      );
    }

    if (value instanceof Date) {
      return value;
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    const registro = value as Record<string, unknown>;
    const registroFormatado = Object.fromEntries(
      Object.entries(registro).map(([key, entryValue]) => [
        key,
        this.adicionarValoresFormatadosNaResposta(entryValue),
      ]),
    ) as Record<string, unknown>;

    if (typeof registroFormatado.total !== 'string') {
      return registroFormatado;
    }

    const totalNumerico = Number(registroFormatado.total);

    if (Number.isNaN(totalNumerico)) {
      return registroFormatado;
    }

    return {
      ...registroFormatado,
      totalFormatado: new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(totalNumerico),
    };
  }

  private serializarBigIntRecursivo(value: unknown): unknown {
    if (typeof value === 'bigint') {
      return this.formatarNumeroBilhete(value);
    }

    if (value instanceof Prisma.Decimal) {
      return value.toString();
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.serializarBigIntRecursivo(item));
    }

    if (value instanceof Date || value === null || value === undefined) {
      return value;
    }

    if (typeof value !== 'object') {
      return value;
    }

    const serializedEntries = Object.entries(value).map(([key, entryValue]) => [
      key,
      this.serializarBigIntRecursivo(entryValue),
    ]);

    return Object.fromEntries(serializedEntries);
  }

  private normalizarTextoObrigatorio(value: string, fieldName: string): string {
    const normalizedValue = value.trim();

    if (!normalizedValue) {
      throw new BadRequestException(`${fieldName} não pode ser vazio`);
    }

    return normalizedValue;
  }

  private validarEdicaoForaDeManutencao(edicao: {
    id: string;
    numero: string;
    manutencaoAtiva: boolean;
    manutencaoMensagem: string | null;
  }): void {
    if (!edicao.manutencaoAtiva) {
      return;
    }

    throw criarExcecaoEdicaoEmManutencao(edicao);
  }

  private resolverQuantidadeCartelasSolicitada(dto: CreateVendaDto): number {
    const quantidadeCartelas = dto.quantidadeCartelas ?? dto.quantidade;

    if (quantidadeCartelas === undefined) {
      throw new BadRequestException('Informe quantidadeCartelas');
    }

    if (
      dto.quantidadeCartelas !== undefined &&
      dto.quantidade !== undefined &&
      dto.quantidadeCartelas !== dto.quantidade
    ) {
      throw new BadRequestException(
        'quantidade deve ser igual a quantidadeCartelas quando ambos forem enviados',
      );
    }

    return quantidadeCartelas;
  }

  private resolverTipoPagamento(
    dto: CreateVendaDto,
    user?: RequestUser,
    options?: CreateVendaOptions,
  ): TipoPagamento {
    if (user?.perfil === 'ADMIN') {
      return TipoPagamento.MANUAL;
    }

    if (!dto.tipoPagamento) {
      throw new BadRequestException(
        'tipoPagamento é obrigatório para vendas que não são diretas do ADMIN',
      );
    }

    if (dto.tipoPagamento === TipoPagamento.MANUAL) {
      if (options?.origemParticipacao === OrigemParticipacao.POS) {
        return TipoPagamento.MANUAL;
      }

      throw new BadRequestException(
        'tipoPagamento MANUAL é permitido apenas para venda direta do ADMIN ou no canal POS',
      );
    }

    return dto.tipoPagamento;
  }

  private resolverCriadoPorId(user?: RequestUser): string | null {
    if (
      user &&
      ['ADMIN', 'DISTRIBUIDOR', 'VENDEDOR'].includes(user.perfil)
    ) {
      return user.id;
    }

    return null;
  }

  private normalizarTextoOpcional(value: string): string | null {
    const normalizedValue = value.trim();
    return normalizedValue ? normalizedValue : null;
  }

  private async buscarOuCriarClientePorDto(
    dto: CreateVendaDto,
  ): Promise<ClienteCompra> {
    if (
      !dto.cpf ||
      !dto.nome ||
      !dto.telefone ||
      !dto.email ||
      !dto.dataNascimento
    ) {
      throw new BadRequestException(
        'Informe clienteId ou os dados completos do cliente para concluir a compra',
      );
    }

    return this.buscarOuCriarCliente(
      dto.cpf.replace(/\D/g, ''),
      dto.nome,
      dto.telefone,
      dto.dataNascimento,
      dto.email,
      dto.vendedorId,
      dto.distribuidorId,
    );
  }

  async buscarClientePorIdParaCompra(
    clienteId: string,
    vendedorId?: string,
    distribuidorId?: string,
  ): Promise<ClienteCompra> {
    const relacionamentoMaisRecente =
      await this.resolverRelacionamentoMaisRecenteDoCliente(
        vendedorId,
        distribuidorId,
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

  validarDadosClienteParaPagamento(
    cliente: ClienteCompra,
  ): DadosClientePagamento {
    if (!cliente.email) {
      throw new BadRequestException(
        'Cliente sem e-mail cadastrado. Atualize meus-dados antes de concluir a compra',
      );
    }

    if (!cliente.dataNascimento) {
      throw new BadRequestException(
        'Cliente sem data de nascimento cadastrada. Atualize meus-dados antes de concluir a compra',
      );
    }

    validarMaioridade(cliente.dataNascimento);

    return {
      id: cliente.id,
      cpf: cliente.cpf.replace(/\D/g, ''),
      nome: cliente.nome,
      telefone: cliente.telefone,
      email: cliente.email,
    };
  }

  private async buscarOuCriarCliente(
    cpf: string,
    nome: string,
    telefone: string,
    dataNascimentoInput: string,
    email?: string,
    vendedorId?: string,
    distribuidorId?: string,
  ) {
    const dataNascimento = parseEValidarDataNascimento(dataNascimentoInput);
    const relacionamentoMaisRecente =
      await this.resolverRelacionamentoMaisRecenteDoCliente(
        vendedorId,
        distribuidorId,
      );
    const existente = await this.prisma.cliente.findUnique({
      where: { cpf },
    });

    if (existente) {
      if (!existente.dataNascimento) {
        return this.prisma.cliente.update({
          where: { id: existente.id },
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
          where: { id: existente.id },
          data: relacionamentoMaisRecente,
        });
      }

      return existente;
    }

    const cliente = await this.prisma.cliente.create({
      data: {
        cpf,
        nome,
        telefone,
        email: email?.trim() || null,
        dataNascimento,
        vendedorId: relacionamentoMaisRecente.vendedorId ?? null,
        distribuidorId: relacionamentoMaisRecente.distribuidorId ?? null,
      },
    });

    this.logger.log(`Cliente auto-criado: ${nome} (CPF: ${cpf})`);
    return cliente;
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

  private validarJanelaDeVenda(
    edicaoNumero: string,
    dataEncerramento: Date,
  ): void {
    const agora = Date.now();
    const encerramento = new Date(dataEncerramento).getTime();

    if (Number.isNaN(encerramento)) {
      return;
    }

    if (agora >= encerramento) {
      throw new BadRequestException(
        `As vendas da edição ${edicaoNumero} estão encerradas`,
      );
    }
  }

  private async alocarBilhetes(
    tx: Prisma.TransactionClient,
    venda: {
      id: string;
      edicaoId: string;
      quantidade: number;
      origemParticipacao: OrigemParticipacao;
      tipoCartela?: TipoCartela | null;
      gatewayPayload?: Prisma.JsonValue | null;
    },
  ): Promise<number> {
    const edicao = await tx.edicao.findUnique({
      where: { id: venda.edicaoId },
      select: {
        combos: {
          select: { id: true, origemParticipacao: true, tipoCartela: true, preco: true, rangeInicio: true, rangeFinal: true },
          orderBy: [{ origemParticipacao: 'asc' }, { tipoCartela: 'asc' }],
        },
      },
    });

    if (!edicao) {
      throw new NotFoundException('Edição não encontrada para alocação');
    }

    const configuracaoVenda = this.resolverConfiguracaoDaVenda(
      edicao.combos,
      venda.origemParticipacao,
      venda.tipoCartela ?? undefined,
    );
    const comboRange = configuracaoVenda.combo;
    const quantidadeCartelasPorCombo = configuracaoVenda.quantidadeCartelas;
    const combosSelecionados =
      this.extrairCombosSelecionadosDaVenda(venda.gatewayPayload) ?? [];

    let matrizDisponiveis: MatrizDisponivel[] = [];

    if (combosSelecionados.length > 0) {
      const linhas = await tx.matrizRange.findMany({
        where: {
          numero: {
            in: combosSelecionados,
            gte: comboRange.rangeInicio,
            lte: comboRange.rangeFinal,
          },
          bilhetes: { none: { edicaoId: venda.edicaoId } },
        },
      });
      if (linhas.length < combosSelecionados.length) {
        throw new BadRequestException(
          'Alguns bilhetes selecionados não estão disponíveis ou estão fora do range deste combo.',
        );
      }
      matrizDisponiveis = linhas;
    } else {
      const gruposDisponiveis = await this.selecionarGruposDisponiveisParaVenda(
        tx,
        venda.edicaoId,
        comboRange,
        quantidadeCartelasPorCombo,
        venda.quantidade,
        { strict: true },
      );
      matrizDisponiveis = gruposDisponiveis.flat();
    }

    // Criar bilhetes associando à MatrizRange e à edição
    const bilhetesData: Prisma.BilheteCreateManyInput[] = matrizDisponiveis.map(
      (linha) => ({
        vendaId: venda.id,
        edicaoId: venda.edicaoId,
        matrizId: linha.id,
        numero: linha.numero,
        sequenciaBolas: linha.sequenciaBolas,
      }),
    );

    await tx.bilhete.createMany({ data: bilhetesData });

    return bilhetesData.length;
  }

  private async selecionarGruposDisponiveisParaVenda(
    client: Prisma.TransactionClient | PrismaService | PrismaClient,
    edicaoId: string,
    combo: { rangeInicio: bigint; rangeFinal: bigint },
    quantidadeCartelasPorCombo: number,
    quantidadeGrupos: number,
    options: {
      cursorNumeroBase?: bigint;
      direcao?: DirecaoCombo;
      strict?: boolean;
      numerosBaseSelecionados?: bigint[];
      numerosReservadosAEvitar?: string[];
    } = {},
  ): Promise<MatrizDisponivel[][]> {
    const setores = this.expandirSetoresDoCombo(combo, quantidadeCartelasPorCombo);
    const primeiroSetor = setores[0];

    if (!primeiroSetor) {
      throw new BadRequestException(
        `O range ${combo.rangeInicio}-${combo.rangeFinal} não suporta ${quantidadeCartelasPorCombo} cartela(s)`,
      );
    }

    const quantidadeCartelas = quantidadeGrupos;

    if ((options.numerosBaseSelecionados?.length ?? 0) > 0) {
      return this.montarGruposPorNumerosBaseSelecionados(
        client,
        edicaoId,
        options.numerosBaseSelecionados ?? [],
        primeiroSetor,
        setores,
        options.strict ?? false,
      );
    }

    const direcao = options.direcao ?? 'PROXIMO';
    const gruposSelecionados: MatrizDisponivel[][] = [];
    const numerosReservados = new Set<string>();
    let cursor =
      options.cursorNumeroBase ??
      (direcao === 'PROXIMO'
        ? primeiroSetor.rangeInicio - 1n
        : primeiroSetor.rangeFinal + 1n);

    while (gruposSelecionados.length < quantidadeCartelas) {
      const numeroWhere: Prisma.BigIntFilter = {
        gte: primeiroSetor.rangeInicio,
        lte: primeiroSetor.rangeFinal,
      };

      if (direcao === 'PROXIMO') {
        numeroWhere.gt = cursor;
      } else {
        numeroWhere.lt = cursor;
      }

      const candidatosBase = await client.matrizRange.findMany({
        where: {
          numero: numeroWhere,
          bilhetes: {
            none: {
              edicaoId,
            },
          },
        },
        orderBy: { numero: direcao === 'PROXIMO' ? 'asc' : 'desc' },
        take: Math.max(
          (quantidadeCartelas - gruposSelecionados.length) * 3,
          25,
        ),
      });

      if (candidatosBase.length === 0) {
        break;
      }

      const candidatosBaseFiltrados = candidatosBase.filter((c) => {
        if (
          !options.numerosReservadosAEvitar ||
          options.numerosReservadosAEvitar.length === 0
        )
          return true;
        // Se qualquer número do grupo que será formado estiver reservado, pula este candidato base
        for (const setor of setores) {
          const numeroFuturo = this.calcularNumeroDoSetorParaBase(
            c.numero,
            primeiroSetor,
            setor,
          );
          if (
            options.numerosReservadosAEvitar.includes(numeroFuturo.toString())
          ) {
            return false;
          }
        }
        return true;
      });

      if (candidatosBaseFiltrados.length === 0) {
        cursor = candidatosBase[candidatosBase.length - 1].numero;
        continue;
      }

      const numerosNecessarios: bigint[] = [];
      const numerosNecessariosSet = new Set<string>();
      const adicionarNumero = (numero: bigint) => {
        const chave = numero.toString();
        if (numerosNecessariosSet.has(chave)) {
          return;
        }

        numerosNecessariosSet.add(chave);
        numerosNecessarios.push(numero);
      };

      for (const candidato of candidatosBaseFiltrados) {
        for (const setor of setores) {
          adicionarNumero(
            this.calcularNumeroDoSetorParaBase(
              candidato.numero,
              primeiroSetor,
              setor,
            ),
          );
        }
      }

      const linhasDisponiveis = await client.matrizRange.findMany({
        where: {
          numero: {
            in: numerosNecessarios,
          },
          bilhetes: {
            none: {
              edicaoId,
            },
          },
        },
        orderBy: { numero: 'asc' },
      });

      const linhasPorNumero = new Map(
        linhasDisponiveis.map((linha) => [linha.numero.toString(), linha]),
      );

      for (const candidato of candidatosBase) {
        const grupo: MatrizDisponivel[] = [];
        let grupoCompleto = true;

        for (const setor of setores) {
          const numeroGrupo = this.calcularNumeroDoSetorParaBase(
            candidato.numero,
            primeiroSetor,
            setor,
          );
          const chave = numeroGrupo.toString();

          if (numerosReservados.has(chave)) {
            grupoCompleto = false;
            break;
          }

          const linha = linhasPorNumero.get(chave);

          if (!linha) {
            grupoCompleto = false;
            break;
          }

          grupo.push(linha);
        }

        if (!grupoCompleto) {
          continue;
        }

        gruposSelecionados.push(grupo);
        grupo.forEach((linha) =>
          numerosReservados.add(linha.numero.toString()),
        );

        if (gruposSelecionados.length === quantidadeCartelas) {
          break;
        }
      }

      cursor = candidatosBase[candidatosBase.length - 1].numero;
    }

    if (
      (options.strict ?? false) &&
      gruposSelecionados.length < quantidadeCartelas
    ) {
      throw new BadRequestException(
        `Não há cartelas suficientes disponíveis para esta edição. Cartelas disponíveis: ${gruposSelecionados.length}, solicitadas: ${quantidadeCartelas}, cartelas por combo: ${quantidadeCartelasPorCombo}`,
      );
    }

    return gruposSelecionados;
  }

  private async montarGruposPorNumerosBaseSelecionados(
    client: Prisma.TransactionClient | PrismaService | PrismaClient,
    edicaoId: string,
    numerosBaseSelecionados: bigint[],
    primeiroSetor: {
      rangeInicio: bigint;
      rangeFinal: bigint;
    },
    setores: Array<{
      rangeInicio: bigint;
      rangeFinal: bigint;
    }>,
    strict: boolean,
  ): Promise<MatrizDisponivel[][]> {
    const numerosNecessarios: bigint[] = [];
    const numerosNecessariosSet = new Set<string>();

    for (const numeroBase of numerosBaseSelecionados) {
      if (
        numeroBase < primeiroSetor.rangeInicio ||
        numeroBase > primeiroSetor.rangeFinal
      ) {
        throw new BadRequestException(
          `O combo ${numeroBase.toString()} está fora do setor inicial permitido para esta cartela`,
        );
      }

      for (const setor of setores) {
        const numero = this.calcularNumeroDoSetorParaBase(
          numeroBase,
          primeiroSetor,
          setor,
        );
        const chave = numero.toString();

        if (numerosNecessariosSet.has(chave)) {
          continue;
        }

        numerosNecessariosSet.add(chave);
        numerosNecessarios.push(numero);
      }
    }

    const linhasDisponiveis = await client.matrizRange.findMany({
      where: {
        numero: {
          in: numerosNecessarios,
        },
        bilhetes: {
          none: {
            edicaoId,
          },
        },
      },
      orderBy: { numero: 'asc' },
    });

    const linhasPorNumero = new Map(
      linhasDisponiveis.map((linha) => [linha.numero.toString(), linha]),
    );
    const grupos: MatrizDisponivel[][] = [];

    for (const numeroBase of numerosBaseSelecionados) {
      const grupo: MatrizDisponivel[] = [];

      for (const setor of setores) {
        const numero = this.calcularNumeroDoSetorParaBase(
          numeroBase,
          primeiroSetor,
          setor,
        );
        const linha = linhasPorNumero.get(numero.toString());

        if (!linha) {
          if (strict) {
            throw new BadRequestException(
              `O combo ${numeroBase.toString()} não está mais disponível para esta edição`,
            );
          }

          return grupos;
        }

        grupo.push(linha);
      }

      grupos.push(grupo);
    }

    return grupos;
  }

  private resolverConfiguracaoDaVenda(
    combos: ComboVenda[],
    origemParticipacao: OrigemParticipacao,
    tipoCartela?: TipoCartela,
  ): ConfiguracaoVendaResolvida {
    const origemEfetiva = this.resolverOrigemDosRangesParaCombo(origemParticipacao);
    const combosDaOrigem = combos.filter((c) => c.origemParticipacao === origemEfetiva);

    if (combosDaOrigem.length === 0) {
      throw new BadRequestException(
        `A edição não possui combos configurados para a origem ${origemParticipacao}`,
      );
    }

    let comboSelecionado: ComboVenda | undefined;
    if (tipoCartela) {
      comboSelecionado = combosDaOrigem.find((c) => c.tipoCartela === tipoCartela);
      if (!comboSelecionado) {
        throw new BadRequestException(
          `Tipo de cartela solicitado não está disponível para a origem ${origemParticipacao}`,
        );
      }
    } else {
      comboSelecionado =
        combosDaOrigem.find((c) => c.tipoCartela === TipoCartela.UMA_CHANCE) ??
        combosDaOrigem[0];
    }

    return {
      combo: comboSelecionado,
      tipoCartelaSelecionada: comboSelecionado.tipoCartela,
      precoCombo: comboSelecionado.preco,
      quantidadeCartelas: this.obterQuantidadeCartelasDaVenda(comboSelecionado.tipoCartela),
    };
  }

  private expandirSetoresDoCombo(
    combo: { rangeInicio: bigint; rangeFinal: bigint },
    quantidadeCartelas: number,
  ): SetorCombo[] {
    return Array.from({ length: quantidadeCartelas }, (_, i) => ({
      rangeInicio: combo.rangeInicio + BigInt(i),
      rangeFinal: combo.rangeFinal - BigInt(quantidadeCartelas - 1 - i),
      rangeTotalInicio: combo.rangeInicio,
      rangeTotalFinal: combo.rangeFinal,
    }));
  }

  private obterQuantidadeCartelasDaVenda(
    tipoCartela?: TipoCartela | null,
  ): number {
    return tipoCartela ? obterQuantidadeCartelas(tipoCartela) : 1;
  }

  private formatarValorMonetario(valor: Prisma.Decimal | number): string {
    return Number(valor).toFixed(2);
  }

  private resolverTipoCartelaDaSolicitacao(
    tipoCartela?: TipoCartela | null,
    quantidadeCartelas?: number | null,
  ): TipoCartela | undefined {
    const tipoCartelaPelaQuantidade =
      quantidadeCartelas !== undefined && quantidadeCartelas !== null
        ? obterTipoCartelaPorQuantidadeCartelas(quantidadeCartelas)
        : null;

    if (
      quantidadeCartelas !== undefined &&
      quantidadeCartelas !== null &&
      !tipoCartelaPelaQuantidade
    ) {
      throw new BadRequestException(
        `quantidadeCartelas inválida: ${quantidadeCartelas}. Informe um valor entre 1 e 12`,
      );
    }

    if (
      tipoCartela &&
      tipoCartelaPelaQuantidade &&
      tipoCartela !== tipoCartelaPelaQuantidade
    ) {
      throw new BadRequestException(
        `Conflito entre o campo legado de cartelas e quantidadeCartelas (${quantidadeCartelas})`,
      );
    }

    return tipoCartela ?? tipoCartelaPelaQuantidade ?? undefined;
  }

  private calcularNumeroDoSetorParaBase(
    numeroBase: bigint,
    primeiroSetor: {
      rangeInicio: bigint;
      rangeFinal: bigint;
    },
    setorDestino: {
      rangeInicio: bigint;
      rangeFinal: bigint;
    },
  ): bigint {
    const deslocamento = numeroBase - primeiroSetor.rangeInicio;
    const numeroDestino = setorDestino.rangeInicio + deslocamento;

    if (
      numeroDestino < setorDestino.rangeInicio ||
      numeroDestino > setorDestino.rangeFinal
    ) {
      throw new BadRequestException('Número base fora do setor esperado');
    }

    return numeroDestino;
  }

  private resolverOrigemDosRangesParaCombo(
    origemParticipacao: OrigemParticipacao,
  ): OrigemParticipacao {
    // POS não possui ranges próprios: as vendas POS usam a mesma configuração DIGITAL.
    if (origemParticipacao === OrigemParticipacao.POS) {
      return OrigemParticipacao.DIGITAL;
    }

    if (origemParticipacao === OrigemParticipacao.DIGITAL) {
      return OrigemParticipacao.DIGITAL;
    }

    return origemParticipacao;
  }

  private extrairCombosSelecionadosDaVenda(
    gatewayPayload?: Prisma.JsonValue | null,
  ): bigint[] | undefined {
    if (
      !gatewayPayload ||
      typeof gatewayPayload !== 'object' ||
      Array.isArray(gatewayPayload)
    ) {
      return undefined;
    }

    const combosSelecionados = (gatewayPayload as Record<string, unknown>)
      .combosSelecionados;

    if (!Array.isArray(combosSelecionados) || combosSelecionados.length === 0) {
      return undefined;
    }

    return combosSelecionados.flatMap((combo) => {
      if (typeof combo === 'string') {
        return [BigInt(combo)];
      }

      if (
        !combo ||
        typeof combo !== 'object' ||
        !('numeroBase' in combo) ||
        typeof (combo as ComboSelecionadoPersistido).numeroBase !== 'string'
      ) {
        return [];
      }

      return [BigInt((combo as ComboSelecionadoPersistido).numeroBase)];
    });
  }

  private formatarNumeroBilhete(numero: bigint): string {
    return numero.toString().padStart(7, '0');
  }

  private buildWhereFromFiltros(
    filtros?: FiltroVendasDto,
  ): Prisma.VendaWhereInput {
    if (!filtros) return {};

    const where: Prisma.VendaWhereInput = {};

    if (filtros.edicaoId) where.edicaoId = filtros.edicaoId;
    if (filtros.clienteId) where.clienteId = filtros.clienteId;
    if (filtros.vendedorId) where.vendedorId = filtros.vendedorId;
    if (filtros.distribuidorId) where.distribuidorId = filtros.distribuidorId;
    if (filtros.status) where.status = filtros.status;
    if (filtros.tipoPagamento) where.tipoPagamento = filtros.tipoPagamento;

    if (filtros.dataInicio || filtros.dataFim) {
      where.createdAt = {};
      if (filtros.dataInicio) {
        where.createdAt.gte = new Date(filtros.dataInicio);
      }
      if (filtros.dataFim) {
        const dataFim = new Date(filtros.dataFim);
        dataFim.setHours(23, 59, 59, 999);
        where.createdAt.lte = dataFim;
      }
    }

    if (filtros.search) {
      where.cliente = {
        OR: [
          { nome: { contains: filtros.search, mode: 'insensitive' } },
          { cpf: { contains: filtros.search } },
        ],
      };
    }

    return where;
  }

  private buildHierarchyWhere(user?: RequestUser): Prisma.VendaWhereInput {
    if (!user || user.perfil === 'ADMIN') {
      return {};
    }

    if (user.perfil === 'DISTRIBUIDOR') {
      if (!user.distribuidorId) {
        throw new ForbiddenException(
          'Usuário distribuidor sem vínculo válido para consultar vendas',
        );
      }

      return { distribuidorId: user.distribuidorId };
    }

    if (user.perfil === 'VENDEDOR') {
      if (!user.vendedorId) {
        throw new ForbiddenException(
          'Usuário vendedor sem vínculo válido para consultar vendas',
        );
      }

      return { vendedorId: user.vendedorId };
    }

    return {};
  }

  private mergeWhere(
    baseWhere: Prisma.VendaWhereInput,
    scopeWhere: Prisma.VendaWhereInput,
  ): Prisma.VendaWhereInput {
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

  private validarTransicaoStatus(
    statusAtual: StatusVenda,
    statusNovo: StatusVenda,
  ): void {
    const transicoesPermitidas: Record<StatusVenda, StatusVenda[]> = {
      [StatusVenda.PENDENTE]: [
        StatusVenda.APROVADO,
        StatusVenda.RECUSADO,
        StatusVenda.CANCELADO,
      ],
      [StatusVenda.APROVADO]: [StatusVenda.CANCELADO],
      [StatusVenda.RECUSADO]: [StatusVenda.CANCELADO],
      [StatusVenda.CANCELADO]: [],
    };

    const permitidas = transicoesPermitidas[statusAtual];

    if (!permitidas.includes(statusNovo)) {
      throw new BadRequestException(
        `Transição de status ${statusAtual} → ${statusNovo} não é permitida`,
      );
    }
  }

  private async enviarEmailCompraAprovada(vendaId: string): Promise<void> {
    try {
      const venda = await this.prisma.venda.findUnique({
        where: { id: vendaId },
        select: {
          total: true,
          createdAt: true,
          cliente: { select: { nome: true, email: true } },
        },
      });
      if (!venda?.cliente?.email) return;
      const linkVerNumeros = `${this.config.get<string>('FRONTEND_LOJA_URL', '')}/#/consultar-numeros`;
      const valorFormatado = `R$ ${Number(venda.total).toFixed(2).replace('.', ',')}`;
      const dataCompra = new Date(venda.createdAt).toLocaleDateString('pt-BR');
      await this.emailService.enviarCompraAprovada(venda.cliente.email, {
        nomeCliente: venda.cliente.nome,
        valorFormatado,
        dataCompra,
        formaPagamento: 'PIX',
        linkVerNumeros,
      });
    } catch (err) {
      this.logger.error(
        `Falha ao enviar e-mail de compra aprovada para venda ${vendaId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
