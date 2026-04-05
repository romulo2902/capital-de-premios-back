import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatusEdicao, StatusVenda, StatusComissao } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';
import { PaymentGatewayFactory } from '../pagamentos/gateways/payment-gateway.factory';
import { CreateVendaDto } from './dto/create-venda.dto';
import { UpdateVendaStatusDto } from './dto/update-venda-status.dto';
import { FiltroVendasDto } from './dto/filtro-vendas.dto';
import {
  VENDA_INCLUDE,
  VENDA_INCLUDE_DETALHES,
  PIX_EXPIRACAO_SEGUNDOS,
} from './vendas.constants';
import { obterQuantidadeChances } from '../edicoes/edicoes-range.util';

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
    });

    if (!edicao) {
      throw new NotFoundException('Edição não encontrada');
    }

    if (edicao.status !== StatusEdicao.ATIVA) {
      throw new BadRequestException(
        `A edição ${edicao.numero} não está ativa (status: ${edicao.status})`,
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
    }

    if (dto.distribuidorId) {
      const distribuidor = await this.prisma.distribuidor.findUnique({
        where: { id: dto.distribuidorId },
      });
      if (!distribuidor) {
        throw new NotFoundException('Distribuidor não encontrado');
      }
    }

    // 4. Calcular total
    const valorCartela = Number(edicao.valorCartela);
    const total = valorCartela * dto.quantidade;

    // 5. Criar venda com status PENDENTE
    const venda = await this.prisma.venda.create({
      data: {
        edicaoId: dto.edicaoId,
        clienteId: cliente.id,
        vendedorId: dto.vendedorId ?? null,
        distribuidorId: dto.distribuidorId ?? null,
        quantidade: dto.quantidade,
        total: new Prisma.Decimal(total.toFixed(2)),
        status: StatusVenda.PENDENTE,
        origemParticipacao: dto.origemParticipacao ?? 'DIGITAL',
        tipoPagamento: dto.tipoPagamento,
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
      const cobranca = await gateway.criarCobranca({
        vendaId: venda.id,
        valorCentavos: Math.round(total * 100),
        descricao: `Capital de Prêmios — Edição ${edicao.numero} — ${dto.quantidade}x cartela`,
        cpfPagador: cpfLimpo,
        nomePagador: dto.nome,
        expiracaoSegundos: PIX_EXPIRACAO_SEGUNDOS,
      });

      // Atualizar venda com dados do gateway
      await this.prisma.venda.update({
        where: { id: venda.id },
        data: {
          gatewayId: cobranca.gatewayId,
          gatewayPayload: cobranca.payload as Prisma.InputJsonValue,
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
    const venda = await this.prisma.venda.findUnique({
      where: { id },
      include: VENDA_INCLUDE_DETALHES,
    });

    if (!venda) {
      throw new NotFoundException('Venda não encontrada');
    }

    return {
      message: 'Venda encontrada com sucesso',
      data: venda,
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
      const bilhetesAlocados = await this.alocarBilhetes(
        tx,
        venda.id,
        venda.edicaoId,
        venda.quantidade,
      );

      // 2. Criar comissões (Macro p/ Distribuidor e Micro p/ Vendedor)
      if (venda.distribuidorId) {
        const distribuidor = await tx.distribuidor.findUnique({
          where: { id: venda.distribuidorId },
          select: { comissaoPercent: true }
        });
        if (distribuidor) {
          const distPercent = Number(distribuidor.comissaoPercent);
          if (distPercent > 0) {
            const fatiaBrutaDistribuidor = Number(venda.total) * (distPercent / 100);
          let comissaoVendedor = 0;

          // Se houver vendedor envolvido, ele fica com a fatia dele acordada com o distribuidor
          if (venda.vendedorId && venda.vendedor) {
            const vendPercentDaFatia = Number(venda.vendedor.comissaoPercent) || 0; // 0 to 100
            comissaoVendedor = fatiaBrutaDistribuidor * (vendPercentDaFatia / 100);

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
                  saldo: { increment: new Prisma.Decimal(comissaoVendedor.toFixed(2)) },
                },
              });

              this.logger.log(`Comissão Vendedor (R$ ${comissaoVendedor.toFixed(2)}) creditada -> ${venda.vendedorId}`);
            }
          }

          // O saldo remanescente da fatia distribuída vai para o próprio Distribuidor (Spread)
          const comissaoLiquidaDistribuidor = fatiaBrutaDistribuidor - comissaoVendedor;
          if (comissaoLiquidaDistribuidor > 0) {
            await tx.comissaoDistribuidor.create({
              data: {
                distribuidorId: venda.distribuidorId,
                vendaId: venda.id,
                valor: new Prisma.Decimal(comissaoLiquidaDistribuidor.toFixed(2)),
                status: StatusComissao.PENDENTE,
              },
            });

            await tx.distribuidor.update({
              where: { id: venda.distribuidorId },
              data: {
                saldo: { increment: new Prisma.Decimal(comissaoLiquidaDistribuidor.toFixed(2)) },
              },
            });

            this.logger.log(`Comissão Distribuidor Líquida (R$ ${comissaoLiquidaDistribuidor.toFixed(2)}) creditada -> ${venda.distribuidorId}`);
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
      // 1. Liberar bilhetes (marcar ranges como disponíveis de novo)
      if (venda.bilhetes.length > 0) {
        const rangeIds = venda.bilhetes.map((b) => b.rangeId);

        await tx.range.updateMany({
          where: { id: { in: rangeIds } },
          data: { disponivel: true },
        });

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
            ...(venda.gatewayPayload as Record<string, unknown> ?? {}),
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

    if (dto.status === StatusVenda.APROVADO && venda.status === StatusVenda.PENDENTE) {
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

  private async alocarBilhetes(
    tx: Prisma.TransactionClient,
    vendaId: string,
    edicaoId: string,
    quantidade: number,
  ): Promise<number> {
    // Buscar ranges disponíveis que pertencem à edição
    // Para isso, buscamos o range de números da edição e filtramos
    const edicao = await tx.edicao.findUnique({
      where: { id: edicaoId },
      select: { rangeInicio: true, rangeFinal: true },
    });

    if (!edicao) {
      throw new NotFoundException('Edição não encontrada para alocação');
    }

    // Buscar ranges disponíveis dentro do intervalo da edição
    const rangesDisponiveis = await tx.range.findMany({
      where: {
        disponivel: true,
        numero: {
          gte: edicao.rangeInicio,
          lte: edicao.rangeFinal,
        },
      },
      take: quantidade,
      orderBy: { numero: 'asc' },
    });

    if (rangesDisponiveis.length < quantidade) {
      throw new BadRequestException(
        `Não há bilhetes suficientes disponíveis. Disponíveis: ${rangesDisponiveis.length}, solicitados: ${quantidade}`,
      );
    }

    // Marcar ranges como indisponíveis
    await tx.range.updateMany({
      where: {
        id: { in: rangesDisponiveis.map((r) => r.id) },
      },
      data: { disponivel: false },
    });

    // Criar bilhetes
    const bilhetesData: Prisma.BilheteCreateManyInput[] = rangesDisponiveis.map(
      (range) => ({
        vendaId,
        rangeId: range.id,
        numero: range.numero,
        sequenciaBolas: range.sequenciaBolas,
      }),
    );

    await tx.bilhete.createMany({ data: bilhetesData });

    return bilhetesData.length;
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
