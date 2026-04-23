import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EdicaoCombo,
  EdicaoDetalhe,
  OrigemParticipacao,
  Prisma,
  PrismaClient,
  StatusComissao,
  StatusEdicao,
  StatusVenda,
  TipoCartela,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';
import { PaymentGatewayFactory } from '../pagamentos/gateways/payment-gateway.factory';
import { CreateVendaDto } from './dto/create-venda.dto';
import { UpdateVendaStatusDto } from './dto/update-venda-status.dto';
import { UpdateVendaDto } from './dto/update-venda.dto';
import { FiltroVendasDto } from './dto/filtro-vendas.dto';
import {
  VENDA_INCLUDE,
  VENDA_INCLUDE_DETALHES,
  PIX_EXPIRACAO_SEGUNDOS,
} from './vendas.constants';
import {
  expandirSetoresDosDetalhes,
  obterQuantidadeChances,
  obterTipoCartelaPorQuantidadeChances,
} from '../edicoes/edicoes-range.util';

type DetalheVenda = Pick<
  EdicaoDetalhe,
  | 'origemParticipacao'
  | 'tipoCartela'
  | 'rangeInicio'
  | 'rangeFinal'
  | 'preco'
  | 'indiceRange'
>;

type ComboVenda = Pick<
  EdicaoCombo,
  'origemParticipacao' | 'tipoCartela' | 'preco'
>;

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
  detalhes: DetalheVenda[];
  tipoCartelaSelecionada: TipoCartela;
  precoCombo: Prisma.Decimal | null;
  quantidadeChances: number;
}

@Injectable()
export class VendasService {
  private readonly logger = new Logger(VendasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentGatewayFactory: PaymentGatewayFactory,
  ) {}

  // ─── CREATE ────────────────────────────────────────────

  async create(dto: CreateVendaDto) {
    // 1. Validar edição
    const edicao = await this.prisma.edicao.findUnique({
      where: { id: dto.edicaoId },
      include: {
        detalhes: true,
        combos: true,
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

    this.validarJanelaDeVenda(edicao.numero, edicao.dataEncerramento);

    const origemParticipacao =
      dto.origemParticipacao ?? OrigemParticipacao.DIGITAL;
    const tipoCartelaSolicitada = this.resolverTipoCartelaDaSolicitacao(
      dto.tipoCartela,
      dto.quantidadeCartelas,
    );
    const configuracaoVenda = this.resolverConfiguracaoDaVenda(
      edicao.detalhes,
      edicao.combos,
      origemParticipacao,
      tipoCartelaSolicitada,
    );
    const detalhesVenda = configuracaoVenda.detalhes;
    const detalheVenda = detalhesVenda[0];

    if (!detalheVenda) {
      throw new BadRequestException(
        'Não foi possível resolver os ranges da venda para a configuração informada',
      );
    }

    // 2. Buscar ou criar cliente por CPF
    const cpfLimpo = dto.cpf.replace(/\D/g, '');
    const cliente = await this.buscarOuCriarCliente(
      cpfLimpo,
      dto.nome,
      dto.telefone,
      dto.email,
      dto.vendedorId,
      dto.distribuidorId,
    );

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

    if (dto.combosSelecionados && dto.combosSelecionados.length > 0) {
      if (dto.quantidade !== dto.combosSelecionados.length) {
        throw new BadRequestException(
          'A quantidade de cartelas deve ser igual ao número de combos selecionados',
        );
      }
    }

    // 4. Calcular total
    const valorCartela = Number(
      configuracaoVenda.precoCombo ?? edicao.valorCartela,
    );
    const total = valorCartela * dto.quantidade;

    // 5. Criar venda com status PENDENTE
    const venda = await this.prisma.venda.create({
      data: {
        edicaoId: dto.edicaoId,
        clienteId: cliente.id,
        vendedorId: dto.vendedorId ?? null,
        distribuidorId: dto.distribuidorId ?? null,
        quantidade: dto.quantidade,
        tipoCartela: configuracaoVenda.tipoCartelaSelecionada,
        total: new Prisma.Decimal(total.toFixed(2)),
        status: StatusVenda.PENDENTE,
        origemParticipacao,
        tipoPagamento: dto.tipoPagamento,
        ...(dto.combosSelecionados && dto.combosSelecionados.length > 0
          ? { gatewayPayload: { combosSelecionados: dto.combosSelecionados } as unknown as Prisma.InputJsonValue }
          : {}),
      },
      include: VENDA_INCLUDE,
    });

    this.logger.log(
      `Venda ${venda.id} criada — ${dto.quantidade}x cartela — R$ ${total.toFixed(2)} — ${dto.tipoPagamento}`,
    );

    // 6. Criar cobrança no gateway de pagamento
    let dadosPagamento: {
      pixCopiaECola?: string;
      qrCodeBase64?: string;
      urlPagamento?: string;
    } = {};

    try {
      const gateway = this.paymentGatewayFactory.getGateway(dto.tipoPagamento);
      const descricaoCartela = detalheVenda.tipoCartela;
      const cobranca = await gateway.criarCobranca({
        vendaId: venda.id,
        valorCentavos: Math.round(total * 100),
        descricao: descricaoCartela
          ? `Capital de Prêmios — Edição ${edicao.numero} — ${dto.quantidade}x ${descricaoCartela}`
          : `Capital de Prêmios — Edição ${edicao.numero} — ${dto.quantidade}x cartela`,
        cpfPagador: cpfLimpo,
        nomePagador: dto.nome,
        expiracaoSegundos: PIX_EXPIRACAO_SEGUNDOS,
      });

      // Atualizar venda com dados do gateway
      await this.prisma.venda.update({
        where: { id: venda.id },
        data: {
          gatewayId: cobranca.gatewayId,
          gatewayPayload: {
            ...((cobranca.payload as Record<string, unknown>) ?? {}),
            ...(dto.combosSelecionados && dto.combosSelecionados.length > 0
              ? { combosSelecionados: dto.combosSelecionados }
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
      this.logger.error(
        `Erro ao criar cobrança no gateway para venda ${venda.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Venda fica como PENDENTE mesmo sem cobrança no gateway
      // O admin pode reprocessar ou cancelar manualmente
    }

    // 7. Retornar venda + dados de pagamento
    const vendaCompleta = await this.prisma.venda.findUnique({
      where: { id: venda.id },
      include: VENDA_INCLUDE,
    });

    return {
      message: 'Venda criada com sucesso',
      data: {
        ...vendaCompleta,
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
  }) {
    const edicao = await this.prisma.edicao.findUnique({
      where: { id: params.edicaoId },
      select: {
        id: true,
        numero: true,
        status: true,
        dataEncerramento: true,
        rangeInicio: true,
        rangeFinal: true,
        detalhes: {
          select: {
            origemParticipacao: true,
            tipoCartela: true,
            rangeInicio: true,
            rangeFinal: true,
            preco: true,
            indiceRange: true,
          },
          orderBy: [{ origemParticipacao: 'asc' }, { indiceRange: 'asc' }],
        },
        combos: {
          select: {
            origemParticipacao: true,
            tipoCartela: true,
            preco: true,
          },
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
        edicao.detalhes,
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
            tipoCartela: tipoCartelaSolicitada ?? TipoCartela.UMA_CHANCE,
            quantidadeCartelas: 0,
            quantidadeChances: 0,
            passoEntreChances: '0',
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

    const detalhesEfetivos = configuracaoVenda.detalhes;
    const detalheBase = detalhesEfetivos[0];

    if (!detalheBase) {
      throw new BadRequestException(
        'Não foi possível resolver setores para os combos disponíveis',
      );
    }

    const quantidadeChances = configuracaoVenda.quantidadeChances;
    const setores = expandirSetoresDosDetalhes(
      detalhesEfetivos.map((detalhe, index) => ({
        ...detalhe,
        indiceRange: detalhe.indiceRange ?? index + 1,
        ordemConfiguracao: index,
      })),
    );
    const primeiroSetor = setores[0];
    const segundoSetor = setores[1];
    const grupos = await this.selecionarGruposDisponiveisParaVenda(
      this.prisma,
      edicao.id,
      detalhesEfetivos,
      1,
      {
        cursorNumeroBase: params.cursorNumeroBase
          ? BigInt(params.cursorNumeroBase)
          : undefined,
        direcao: params.direcao ?? 'PROXIMO',
        strict: false,
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
        ? {
            numeroBase: primeiroCombo.numeroBase,
            bilhetes: primeiroCombo.bilhetes,
          }
        : null;

    return {
      message: 'Combos disponíveis listados com sucesso',
      data: {
        edicaoId: edicao.id,
        edicaoNumero: edicao.numero,
        status: edicao.status,
        origemParticipacao,
        tipoCartela: configuracaoVenda.tipoCartelaSelecionada,
        quantidadeCartelas: quantidadeChances,
        quantidadeChances,
        preco: configuracaoVenda.precoCombo
          ? configuracaoVenda.precoCombo.toString()
          : null,
        passoEntreChances:
          primeiroSetor && segundoSetor
            ? (segundoSetor.rangeInicio - primeiroSetor.rangeInicio).toString()
            : '0',
        rangeTotalInicio: primeiroSetor?.rangeTotalInicio.toString() ?? '0',
        rangeTotalFinal: primeiroSetor?.rangeTotalFinal.toString() ?? '0',
        setores: setores.map((setor) => ({
          indiceChance: setor.indiceChance,
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

  async findAll(page = 1, limit = 20, filtros?: FiltroVendasDto) {
    const pagination = normalizePagination(page, limit);
    const where = this.buildWhereFromFiltros(filtros);

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

    return buildPaginatedResponse(
      data,
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

  async findOne(id: string) {
    const venda = await this.buscarVendaComContextoEdicao(id);

    return {
      message: 'Venda encontrada com sucesso',
      data: venda,
    };
  }

  async consultarStatus(id: string) {
    const venda = await this.buscarVendaComContextoEdicao(id);

    return {
      message: 'Status da venda consultado com sucesso',
      data: venda,
    };
  }

  async update(id: string, dto: UpdateVendaDto) {
    const venda = await this.prisma.venda.findUnique({
      where: { id },
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

    const vendaAtualizada = await this.buscarVendaComContextoEdicao(id);

    this.logger.log(`Venda ${id} atualizada com sucesso`);

    return {
      message: 'Venda atualizada com sucesso',
      data: vendaAtualizada,
    };
  }

  // ─── FIND BY CLIENTE CPF ──────────────────────────────

  async findByCliente(cpf: string, page = 1, limit = 20) {
    const cpfLimpo = cpf.replace(/\D/g, '');
    const pagination = normalizePagination(page, limit);

    const cliente = await this.prisma.cliente.findUnique({
      where: { cpf: cpfLimpo },
      select: { id: true },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente não encontrado');
    }

    const where = { clienteId: cliente.id };

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

    return buildPaginatedResponse(
      data,
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

    const resultado = await this.prisma.$transaction(async (tx) => {
      // 1. Alocar bilhetes (ranges disponíveis)
      const bilhetesAlocados = await this.alocarBilhetes(tx, venda);

      // 2. Criar comissões (Macro p/ Distribuidor e Micro p/ Vendedor)
      if (venda.distribuidorId) {
        const distribuidor = await tx.distribuidor.findUnique({
          where: { id: venda.distribuidorId },
          select: { comissaoPercent: true },
        });
        if (distribuidor) {
          const distPercent = Number(distribuidor.comissaoPercent);
          if (distPercent > 0) {
            const fatiaBrutaDistribuidor =
              Number(venda.total) * (distPercent / 100);
            let comissaoVendedor = 0;

            // Se houver vendedor envolvido, ele fica com a fatia dele acordada com o distribuidor
            if (venda.vendedorId && venda.vendedor) {
              const vendPercentDaFatia =
                Number(venda.vendedor.comissaoPercent) || 0; // 0 to 100
              comissaoVendedor =
                fatiaBrutaDistribuidor * (vendPercentDaFatia / 100);

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
                      increment: new Prisma.Decimal(
                        comissaoVendedor.toFixed(2),
                      ),
                    },
                  },
                });

                this.logger.log(
                  `Comissão Vendedor (R$ ${comissaoVendedor.toFixed(2)}) creditada -> ${venda.vendedorId}`,
                );
              }
            }

            // O saldo remanescente da fatia distribuída vai para o próprio Distribuidor (Spread)
            const comissaoLiquidaDistribuidor =
              fatiaBrutaDistribuidor - comissaoVendedor;
            if (comissaoLiquidaDistribuidor > 0) {
              await tx.comissaoDistribuidor.create({
                data: {
                  distribuidorId: venda.distribuidorId,
                  vendaId: venda.id,
                  valor: new Prisma.Decimal(
                    comissaoLiquidaDistribuidor.toFixed(2),
                  ),
                  status: StatusComissao.PENDENTE,
                },
              });

              await tx.distribuidor.update({
                where: { id: venda.distribuidorId },
                data: {
                  saldo: {
                    increment: new Prisma.Decimal(
                      comissaoLiquidaDistribuidor.toFixed(2),
                    ),
                  },
                },
              });

              this.logger.log(
                `Comissão Distribuidor Líquida (R$ ${comissaoLiquidaDistribuidor.toFixed(2)}) creditada -> ${venda.distribuidorId}`,
              );
            }
          }
        }
      }

      // 3. Atualizar status da venda
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
    });

    this.logger.log(
      `Pagamento confirmado para venda ${vendaId} — ${resultado.bilhetesAlocados} bilhetes alocados`,
    );

    return {
      message: 'Pagamento confirmado com sucesso',
      data: resultado.vendaAtualizada,
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
          const gateway = this.paymentGatewayFactory.getGateway(
            venda.tipoPagamento,
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

    return {
      message: 'Venda cancelada com sucesso',
      data: vendaAtualizada,
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

    this.logger.log(`Status da venda ${id} alterado para ${dto.status}`);

    return {
      message: 'Status da venda atualizado com sucesso',
      data: vendaAtualizada,
    };
  }

  // ─── HELPERS PRIVADOS ─────────────────────────────────

  private async buscarVendaComContextoEdicao(id: string) {
    const venda = await this.prisma.venda.findUnique({
      where: { id },
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

  private normalizarDadosClienteParaEdicao(
    dto: UpdateVendaDto,
  ): Prisma.ClienteUpdateInput {
    const data: Prisma.ClienteUpdateInput = {};

    if (dto.nome !== undefined) {
      data.nome = this.normalizarTextoObrigatorio(dto.nome, 'nome');
    }

    if (dto.telefone !== undefined) {
      data.telefone = this.normalizarTextoObrigatorio(
        dto.telefone,
        'telefone',
      );
    }

    if (dto.dataNascimento !== undefined) {
      const valorNormalizado = dto.dataNascimento.trim();
      data.dataNascimento = valorNormalizado
        ? this.parseDataNascimento(valorNormalizado)
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

  private normalizarTextoObrigatorio(value: string, fieldName: string): string {
    const normalizedValue = value.trim();

    if (!normalizedValue) {
      throw new BadRequestException(`${fieldName} não pode ser vazio`);
    }

    return normalizedValue;
  }

  private normalizarTextoOpcional(value: string): string | null {
    const normalizedValue = value.trim();
    return normalizedValue ? normalizedValue : null;
  }

  private parseDataNascimento(value: string): Date {
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (isoMatch) {
      return this.validarDataCalendario(
        Number(isoMatch[1]),
        Number(isoMatch[2]),
        Number(isoMatch[3]),
      );
    }

    const brMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (brMatch) {
      return this.validarDataCalendario(
        Number(brMatch[3]),
        Number(brMatch[2]),
        Number(brMatch[1]),
      );
    }

    throw new BadRequestException(
      'dataNascimento deve estar no formato DD/MM/YYYY ou YYYY-MM-DD',
    );
  }

  private validarDataCalendario(year: number, month: number, day: number): Date {
    const candidate = new Date(Date.UTC(year, month - 1, day));

    if (
      Number.isNaN(candidate.getTime()) ||
      candidate.getUTCFullYear() !== year ||
      candidate.getUTCMonth() !== month - 1 ||
      candidate.getUTCDate() !== day
    ) {
      throw new BadRequestException('dataNascimento inválida');
    }

    return candidate;
  }

  private async buscarOuCriarCliente(
    cpf: string,
    nome: string,
    telefone: string,
    email?: string,
    vendedorId?: string,
    distribuidorId?: string,
  ) {
    const existente = await this.prisma.cliente.findUnique({
      where: { cpf },
    });

    if (existente) {
      return existente;
    }

    const cliente = await this.prisma.cliente.create({
      data: {
        cpf,
        nome,
        telefone,
        email: email ?? null,
        vendedorId: vendedorId ?? null,
        distribuidorId: distribuidorId ?? null,
      },
    });

    this.logger.log(`Cliente auto-criado: ${nome} (CPF: ${cpf})`);
    return cliente;
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
        rangeInicio: true,
        rangeFinal: true,
        detalhes: {
          select: {
            origemParticipacao: true,
            tipoCartela: true,
            rangeInicio: true,
            rangeFinal: true,
            preco: true,
            indiceRange: true,
          },
          orderBy: [{ origemParticipacao: 'asc' }, { indiceRange: 'asc' }],
        },
        combos: {
          select: {
            origemParticipacao: true,
            tipoCartela: true,
            preco: true,
          },
          orderBy: [{ origemParticipacao: 'asc' }, { tipoCartela: 'asc' }],
        },
      },
    });

    if (!edicao) {
      throw new NotFoundException('Edição não encontrada para alocação');
    }

    const configuracaoVenda = this.resolverConfiguracaoDaVenda(
      edicao.detalhes,
      edicao.combos,
      venda.origemParticipacao,
      venda.tipoCartela,
    );
    const quantidadeChances = configuracaoVenda.quantidadeChances;
    const detalhesEfetivos = configuracaoVenda.detalhes;
    const combosSelecionados = this.extrairCombosSelecionadosDaVenda(
      venda.gatewayPayload,
    );
    const gruposDisponiveis = await this.selecionarGruposDisponiveisParaVenda(
      tx,
      venda.edicaoId,
      detalhesEfetivos,
      venda.quantidade,
      {
        strict: true,
        numerosBaseSelecionados: combosSelecionados,
      },
    );
    const matrizDisponiveis = gruposDisponiveis.flat();

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
    detalhes: DetalheVenda[],
    quantidadeCartelas: number,
    options: {
      cursorNumeroBase?: bigint;
      direcao?: DirecaoCombo;
      strict?: boolean;
      numerosBaseSelecionados?: bigint[];
    } = {},
  ): Promise<MatrizDisponivel[][]> {
    const setores = expandirSetoresDosDetalhes(
      detalhes.map((detalhe, index) => ({
        ...detalhe,
        indiceRange: detalhe.indiceRange ?? index + 1,
        ordemConfiguracao: index,
      })),
    );
    const primeiroSetor = setores[0];
    const quantidadeChances = setores.length;
    const rangeDescricao =
      primeiroSetor && setores[setores.length - 1]
        ? `${primeiroSetor.rangeTotalInicio.toString()}-${setores[setores.length - 1].rangeTotalFinal.toString()}`
        : 'indefinido';

    if (!primeiroSetor) {
      throw new BadRequestException(
        `O intervalo ${rangeDescricao} não suporta ${quantidadeChances} chances`,
      );
    }

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

      for (const candidato of candidatosBase) {
        for (const setor of setores) {
          adicionarNumero(
            this.calcularNumeroDoSetorParaBase(candidato.numero, primeiroSetor, setor),
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
        `Não há cartelas suficientes disponíveis para esta edição. Cartelas disponíveis: ${gruposSelecionados.length}, solicitadas: ${quantidadeCartelas}, chances por cartela: ${quantidadeChances}`,
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
    detalhes: DetalheVenda[],
    combos: ComboVenda[] | undefined,
    origemParticipacao: OrigemParticipacao,
    tipoCartela?: TipoCartela | null,
  ): ConfiguracaoVendaResolvida {
    const combosDaOrigem = (combos ?? []).filter(
      (combo) => combo.origemParticipacao === origemParticipacao,
    );

    if (combosDaOrigem.length > 0) {
      return this.resolverConfiguracaoDaVendaPorCombos(
        detalhes,
        combosDaOrigem,
        origemParticipacao,
        tipoCartela,
      );
    }

    return this.resolverConfiguracaoDaVendaLegado(
      detalhes,
      origemParticipacao,
      tipoCartela,
    );
  }

  private resolverConfiguracaoDaVendaPorCombos(
    detalhes: DetalheVenda[],
    combosDaOrigem: ComboVenda[],
    origemParticipacao: OrigemParticipacao,
    tipoCartela?: TipoCartela | null,
  ): ConfiguracaoVendaResolvida {
    const origemRanges = this.resolverOrigemDosRangesParaCombo(origemParticipacao);
    const detalhesDaOrigem = detalhes
      .filter((detalhe) => detalhe.origemParticipacao === origemRanges)
      .sort((a, b) => (a.indiceRange ?? 0) - (b.indiceRange ?? 0));

    if (detalhesDaOrigem.length === 0) {
      throw new BadRequestException(
        `A edição não possui range base para a origem ${origemParticipacao}`,
      );
    }

    const comboSelecionado = this.selecionarComboDaOrigem(
      combosDaOrigem,
      origemParticipacao,
      tipoCartela,
    );
    const quantidadeChances = this.obterQuantidadeChancesDaVenda(
      comboSelecionado.tipoCartela,
    );

    if (detalhesDaOrigem.length < quantidadeChances) {
      throw new BadRequestException(
        `A origem ${origemParticipacao} possui ${detalhesDaOrigem.length} range(s), insuficiente para o combo ${comboSelecionado.tipoCartela}`,
      );
    }

    const detalhesSelecionados: DetalheVenda[] = detalhesDaOrigem
      .slice(0, quantidadeChances)
      .map((detalhe, index) => ({
        ...detalhe,
        origemParticipacao: origemRanges,
        tipoCartela: comboSelecionado.tipoCartela,
        preco: comboSelecionado.preco,
        indiceRange: index + 1,
      }));

    return {
      detalhes: detalhesSelecionados,
      tipoCartelaSelecionada: comboSelecionado.tipoCartela,
      precoCombo: comboSelecionado.preco,
      quantidadeChances,
    };
  }

  private selecionarComboDaOrigem(
    combosDaOrigem: ComboVenda[],
    origemParticipacao: OrigemParticipacao,
    tipoCartela?: TipoCartela | null,
  ): ComboVenda {
    if (tipoCartela) {
      const comboDoTipo = combosDaOrigem.find(
        (combo) => combo.tipoCartela === tipoCartela,
      );

      if (!comboDoTipo) {
        throw new BadRequestException(
          `Tipo de cartela ${tipoCartela} não está disponível para a origem ${origemParticipacao}`,
        );
      }

      return comboDoTipo;
    }

    const comboUmaChance = combosDaOrigem.find(
      (combo) => combo.tipoCartela === TipoCartela.UMA_CHANCE,
    );

    if (comboUmaChance) {
      return comboUmaChance;
    }

    if (combosDaOrigem.length === 1) {
      return combosDaOrigem[0];
    }

    throw new BadRequestException(
      `Informe o tipoCartela para a origem ${origemParticipacao} desta edição`,
    );
  }

  private resolverConfiguracaoDaVendaLegado(
    detalhes: DetalheVenda[],
    origemParticipacao: OrigemParticipacao,
    tipoCartela?: TipoCartela | null,
  ): ConfiguracaoVendaResolvida {
    if (detalhes.length === 0) {
      throw new BadRequestException(
        'A edição não possui configuração de ranges para venda',
      );
    }

    const origemRanges = this.resolverOrigemDosRangesParaCombo(origemParticipacao);
    const detalhesDaOrigem = detalhes
      .filter((detalhe) => detalhe.origemParticipacao === origemRanges)
      .sort((a, b) => (a.indiceRange ?? 0) - (b.indiceRange ?? 0));

    if (detalhesDaOrigem.length === 0) {
      throw new BadRequestException(
        `A edição não possui configuração para a origem ${origemParticipacao}`,
      );
    }

    const tipoCartelaSelecionada = tipoCartela ?? TipoCartela.UMA_CHANCE;
    const quantidadeChances = this.obterQuantidadeChancesDaVenda(
      tipoCartelaSelecionada,
    );

    if (detalhesDaOrigem.length < quantidadeChances) {
      throw new BadRequestException(
        `A origem ${origemParticipacao} possui ${detalhesDaOrigem.length} range(s), insuficiente para ${tipoCartelaSelecionada}`,
      );
    }

    const detalhesSelecionados = detalhesDaOrigem
      .slice(0, quantidadeChances)
      .map((detalhe, index) => ({
        ...detalhe,
        tipoCartela: tipoCartelaSelecionada,
        indiceRange: index + 1,
      }));
    const precoCombo =
      detalhesSelecionados.find((detalhe) => detalhe.preco !== null)?.preco ??
      null;

    return {
      detalhes: detalhesSelecionados,
      tipoCartelaSelecionada,
      precoCombo,
      quantidadeChances,
    };
  }

  private obterQuantidadeChancesDaVenda(
    tipoCartela?: TipoCartela | null,
  ): number {
    return tipoCartela ? obterQuantidadeChances(tipoCartela) : 1;
  }

  private resolverTipoCartelaDaSolicitacao(
    tipoCartela?: TipoCartela | null,
    quantidadeCartelas?: number | null,
  ): TipoCartela | undefined {
    const tipoCartelaPelaQuantidade =
      quantidadeCartelas !== undefined && quantidadeCartelas !== null
        ? obterTipoCartelaPorQuantidadeChances(quantidadeCartelas)
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
        `Conflito entre tipoCartela (${tipoCartela}) e quantidadeCartelas (${quantidadeCartelas})`,
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

    if (numeroDestino < setorDestino.rangeInicio || numeroDestino > setorDestino.rangeFinal) {
      throw new BadRequestException('Número base fora do setor esperado');
    }

    return numeroDestino;
  }

  private resolverOrigemDosRangesParaCombo(
    origemParticipacao: OrigemParticipacao,
  ): OrigemParticipacao {
    if (origemParticipacao === OrigemParticipacao.POS) {
      return OrigemParticipacao.FISICO;
    }

    if (origemParticipacao === OrigemParticipacao.DIGITAL) {
      return OrigemParticipacao.DIGITAL;
    }

    return origemParticipacao;
  }

  private extrairCombosSelecionadosDaVenda(
    gatewayPayload?: Prisma.JsonValue | null,
  ): bigint[] | undefined {
    if (!gatewayPayload || typeof gatewayPayload !== 'object' || Array.isArray(gatewayPayload)) {
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
}
