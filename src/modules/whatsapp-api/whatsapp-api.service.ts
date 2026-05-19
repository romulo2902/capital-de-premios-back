import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { VendasService } from '../vendas/vendas.service';
import { PagamentosService } from '../pagamentos/pagamentos.service';
import { PaymentGatewayFactory } from '../pagamentos/gateways/payment-gateway.factory';
import {
  OrigemParticipacao,
  Prisma,
  StatusEdicao,
  StatusVenda,
  TipoCartela,
  TipoPagamento,
} from '@prisma/client';
import type { AuthWhatsappDto } from './dto/auth-whatsapp.dto';
import type { CriarPedidoWhatsappDto } from './dto/criar-pedido-whatsapp.dto';
import type { PreviewCotasWhatsappDto } from './dto/preview-cotas-whatsapp.dto';
import type { ConsultarPedidosWhatsappDto } from './dto/consultar-pedidos-whatsapp.dto';
import type { JwtPayload } from '../auth/auth.service';
import {
  obterQuantidadeCartelas,
  obterTipoCartelaPorQuantidadeCartelas,
} from '../edicoes/edicoes-range.util';
import { mapearErroPagamento } from '../../common/errors/payment-error.util';
import {
  parseEValidarDataNascimento,
  validarMaioridade,
} from '../../common/utils/data-nascimento.util';

export type TipoCompraWhatsapp = 'UNITARIO' | 'COMBO';

export interface OpcaoCompraWhatsapp {
  tipoCompra: TipoCompraWhatsapp;
  isCombo: boolean;
  quantidadeCartelas: number;
  valorUnitarioCartela: string;
  valorUnitario: string;
  valorCombo: string | null;
  preco: string;
  precoFormatado: string;
}

@Injectable()
export class WhatsappApiService {
  private readonly logger = new Logger(WhatsappApiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly vendasService: VendasService,
    private readonly pagamentosService: PagamentosService,
    private readonly paymentGatewayFactory: PaymentGatewayFactory,
  ) {}

  // ─── AUTH ──────────────────────────────────────────────────────────────────

  /**
   * Registra ou autentica um cliente via CPF.
   * Telefone é sempre obrigatório nesta rota.
   * Se o cliente já existe, atualiza nome/telefone/email com os dados enviados.
   */
  async autenticarOuCriar(dto: AuthWhatsappDto) {
    const cpfLimpo = dto.cpf.replace(/\D/g, '');
    const telefoneLimpo = dto.telefone.replace(/\D/g, '');
    const emailNormalizado = dto.email?.trim() || null;
    if (!dto.dataNascimento) {
      throw new BadRequestException(
        'dataNascimento é obrigatória para cadastro do cliente',
      );
    }
    const dataNascimento = parseEValidarDataNascimento(dto.dataNascimento);

    let cliente = await this.prisma.cliente.findUnique({
      where: { cpf: cpfLimpo },
    });

    if (!cliente) {
      cliente = await this.prisma.cliente.create({
        data: {
          cpf: cpfLimpo,
          nome: dto.nome,
          telefone: telefoneLimpo,
          email: emailNormalizado,
          dataNascimento,
        },
      });
      this.logger.log(`Novo cliente criado via WhatsApp API: CPF ${cpfLimpo}`);
    } else {
      if (cliente.dataNascimento) {
        validarMaioridade(cliente.dataNascimento);
      }

      await this.prisma.cliente.update({
        where: { id: cliente.id },
        data: {
          nome: dto.nome,
          telefone: telefoneLimpo,
          ...(emailNormalizado ? { email: emailNormalizado } : {}),
          ...(cliente.dataNascimento ? {} : { dataNascimento }),
        },
      });
      cliente = {
        ...cliente,
        nome: dto.nome,
        telefone: telefoneLimpo,
        email: emailNormalizado ?? cliente.email,
        dataNascimento: cliente.dataNascimento ?? dataNascimento,
      };
      this.logger.log(`Autenticação WhatsApp API: CPF ${cpfLimpo}`);
    }

    const payload: JwtPayload = {
      sub: cliente.id,
      perfil: 'CLIENTE',
      cpf: cpfLimpo,
    };

    const accessToken = this.jwtService.sign(
      payload,
      this.getAccessTokenOptions(),
    );
    const refreshToken = this.jwtService.sign(
      payload,
      this.getRefreshTokenOptions(),
    );

    return {
      message: cliente
        ? 'Autenticação realizada com sucesso'
        : 'Cliente cadastrado com sucesso',
      data: {
        accessToken,
        refreshToken,
        perfil: 'CLIENTE',
        cliente: {
          id: cliente.id,
          nome: cliente.nome,
          cpf: this.mascararCpf(cpfLimpo),
          telefone: cliente.telefone,
          email: cliente.email,
        },
      },
    };
  }

  // ─── CAMPANHA ATIVA ────────────────────────────────────────────────────────

  /**
   * Retorna a edição ativa com todos os detalhes necessários para o bot:
   * preços, opções de cartela, deadline de vendas e sorteio.
   */
  async consultarCampanhaAtiva() {
    const edicao = await this.prisma.edicao.findFirst({
      where: { status: StatusEdicao.ATIVA },
      include: {
        premios: { orderBy: { ordem: 'asc' } },
        detalhes: {
          where: { origemParticipacao: OrigemParticipacao.DIGITAL },
          orderBy: { indiceRange: 'asc' },
        },
        combos: {
          where: { origemParticipacao: OrigemParticipacao.DIGITAL },
          orderBy: { tipoCartela: 'asc' },
        },
      },
    });

    if (!edicao) {
      return {
        message: 'Nenhuma campanha ativa no momento',
        data: null,
      };
    }

    const valorUnitarioCartela = this.formatarValorMonetario(
      edicao.valorCartela,
    );
    const opcoesCompra = this.mapearOpcoesCompraDaCampanha(
      edicao.combos,
      edicao.valorCartela,
    );

    return {
      message: 'Campanha ativa encontrada',
      data: {
        id: edicao.id,
        numero: edicao.numero,
        titulo: `Edição ${edicao.numero}`,
        frase: edicao.frase,
        imagemUrl: edicao.imagemUrl,
        status: edicao.status,
        dataSorteio: edicao.dataSorteio,
        dataEncerramento: edicao.dataEncerramento,
        valorCartela: valorUnitarioCartela,
        valorUnitarioCartela,
        qtdNumerosCartela: edicao.qtdNumerosCartela,
        opcoesCompra,
        premios: edicao.premios.map((p) => ({
          ordem: p.ordem,
          descricao: p.descricao,
          valor: p.valor.toString(),
          imagemUrl: p.imagemUrl,
          valorFormatado: new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          }).format(Number(p.valor)),
        })),
      },
    };
  }

  // ─── PREVIEW DE COTAS ──────────────────────────────────────────────────────

  /**
   * Gera preview de combos disponíveis para a campanha informada,
   * SEM reservar nenhum número. Ideal para o bot mostrar opções antes
   * da confirmação do cliente.
   */
  async previewCotas(edicaoId: string, dto: PreviewCotasWhatsappDto) {
    return this.vendasService.listarCombosDisponiveis({
      edicaoId,
      origemParticipacao: OrigemParticipacao.DIGITAL,
      tipoCartela: dto.tipoCartela,
      quantidadeCartelas:
        dto.quantidadeCartelas ?? (dto.tipoCartela ? undefined : 1),
      cursorNumeroBase: dto.cursorNumeroBase,
      direcao: dto.direcao ?? 'PROXIMO',
      limit: dto.quantidade ?? 1,
    });
  }

  // ─── CRIAR PEDIDO COM PIX ─────────────────────────────────────────────────

  /**
   * Cria o pedido (venda PENDENTE) e já dispara a geração do PIX no PagBank,
   * tudo em uma única chamada. Retorna o `pixCopiaECola` para o bot
   * enviar ao cliente via WhatsApp.
   */
  async criarPedidoComPix(dto: CriarPedidoWhatsappDto, clienteId: string) {
    // Buscar cliente para obter CPF e nome
    const cliente = await this.prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, cpf: true, nome: true },
    });

    if (!cliente) {
      throw new UnauthorizedException('Cliente não encontrado');
    }

    // Buscar edição ativa
    const edicao = await this.prisma.edicao.findUnique({
      where: { id: dto.edicaoId },
      include: { detalhes: true, combos: true },
    });

    if (!edicao) {
      throw new NotFoundException('Campanha não encontrada');
    }

    if (edicao.status !== StatusEdicao.ATIVA) {
      throw new BadRequestException(
        `A campanha ${edicao.numero} não está ativa (status: ${edicao.status})`,
      );
    }

    // Resolver tipo de cartela
    const tipoCartela = this.resolverTipoCartela(dto);
    const quantidadeCartelasPorCombo = obterQuantidadeCartelas(tipoCartela);
    const compraUnitaria = this.isCartelaUnitaria(tipoCartela);
    const combo = edicao.combos.find(
      (c) =>
        c.origemParticipacao === OrigemParticipacao.DIGITAL &&
        c.tipoCartela === tipoCartela,
    );

    if (!compraUnitaria && !combo) {
      throw new BadRequestException(
        `Quantidade de cartelas (${quantidadeCartelasPorCombo}) não disponível para esta campanha`,
      );
    }

    const valorSelecionado = compraUnitaria
      ? Number(edicao.valorCartela)
      : Number(combo!.preco);
    const total = valorSelecionado * dto.quantidade;
    const quantidadeCartelasCompra =
      quantidadeCartelasPorCombo * dto.quantidade;

    // Criar venda PENDENTE
    const venda = await this.prisma.venda.create({
      data: {
        edicaoId: edicao.id,
        clienteId: cliente.id,
        quantidade: dto.quantidade,
        tipoCartela,
        total: new Prisma.Decimal(total.toFixed(2)),
        status: StatusVenda.PENDENTE,
        origemParticipacao: OrigemParticipacao.DIGITAL,
        tipoPagamento: TipoPagamento.PIX,
        gatewayPayload: dto.combosSelecionados
          ? ({
              combosSelecionados: dto.combosSelecionados.map((c) => ({
                numeroBase: c.numeroBase,
              })),
              origem: 'WHATSAPP',
            } as unknown as Prisma.InputJsonValue)
          : ({ origem: 'WHATSAPP' } as unknown as Prisma.InputJsonValue),
      },
    });

    this.logger.log(
      `Pedido WhatsApp criado: vendaId=${venda.id} clienteId=${clienteId} total=R$${total.toFixed(2)}`,
    );

    // Gerar cobrança PIX
    let dadosPix: {
      pixCopiaECola?: string;
      qrCodeUrl?: string;
      expiracaoMinutos: number;
    } = { expiracaoMinutos: 60 };

    try {
      const gateway = this.paymentGatewayFactory.getGateway(TipoPagamento.PIX);
      const cobranca = await gateway.criarCobranca({
        vendaId: venda.id,
        valorCentavos: Math.round(total * 100),
        descricao: `Capital de Prêmios — Edição ${edicao.numero} — ${quantidadeCartelasCompra} cartela(s)`,
        cpfPagador: cliente.cpf,
        nomePagador: cliente.nome,
        expiracaoSegundos: 3600, // 60 minutos
      });

      await this.prisma.venda.update({
        where: { id: venda.id },
        data: {
          gatewayId: cobranca.gatewayId,
          gatewayPayload: {
            ...((cobranca.payload as Record<string, unknown>) ?? {}),
            origem: 'WHATSAPP',
            ...(dto.combosSelecionados
              ? {
                  combosSelecionados: dto.combosSelecionados.map((c) => ({
                    numeroBase: c.numeroBase,
                  })),
                }
              : {}),
          } as Prisma.InputJsonValue,
        },
      });

      dadosPix = {
        pixCopiaECola: cobranca.pixCopiaECola,
        qrCodeUrl: cobranca.qrCodeBase64, // URL da imagem do QR Code
        expiracaoMinutos: 60,
      };

      this.logger.log(
        `PIX gerado para venda WhatsApp: vendaId=${venda.id} gatewayId=${cobranca.gatewayId}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Erro ao gerar PIX para venda WhatsApp ${venda.id}: ${errorMessage}`,
      );
      const gatewayPayloadAtual =
        venda.gatewayPayload &&
        typeof venda.gatewayPayload === 'object' &&
        !Array.isArray(venda.gatewayPayload)
          ? (venda.gatewayPayload as Record<string, unknown>)
          : {};

      await this.prisma.venda.update({
        where: { id: venda.id },
        data: {
          status: StatusVenda.RECUSADO,
          gatewayPayload: {
            ...gatewayPayloadAtual,
            erroPagamento: errorMessage,
          } as Prisma.InputJsonValue,
        },
      });

      const erroPagamento = mapearErroPagamento(errorMessage);
      throw new BadGatewayException({
        message: erroPagamento.userMessage,
        errorCode: erroPagamento.errorCode,
      });
    }

    return {
      message: 'Pedido criado com sucesso. Aguardando pagamento PIX.',
      data: {
        pedidoId: venda.id,
        status: StatusVenda.PENDENTE,
        total: total.toFixed(2),
        totalFormatado: new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }).format(total),
        quantidade: quantidadeCartelasCompra,
        quantidadeCombos: dto.quantidade,
        quantidadeCartelasPorCombo,
        quantidadeCartelas: quantidadeCartelasCompra,
        tipoCompra: compraUnitaria ? 'UNITARIO' : 'COMBO',
        valorUnitarioCartela: this.formatarValorMonetario(edicao.valorCartela),
        valorCombo: compraUnitaria
          ? null
          : this.formatarValorMonetario(combo!.preco),
        campanha: {
          id: edicao.id,
          numero: edicao.numero,
        },
        pagamento: {
          tipo: 'PIX',
          ...dadosPix,
          instrucoes: dadosPix.pixCopiaECola
            ? 'Copie o código PIX e pague no seu banco. O pedido é confirmado automaticamente após o pagamento.'
            : 'PIX temporariamente indisponível. Entre em contato com o suporte.',
        },
      },
    };
  }

  // ─── STATUS DO PAGAMENTO ───────────────────────────────────────────────────

  /**
   * Consulta o status do pagamento de um pedido.
   * Valida que o pedido pertence ao cliente autenticado.
   */
  async consultarStatusPagamento(pedidoId: string, clienteId: string) {
    const venda = await this.prisma.venda.findFirst({
      where: { id: pedidoId, clienteId },
      select: {
        id: true,
        status: true,
        gatewayId: true,
        tipoPagamento: true,
        total: true,
        createdAt: true,
      },
    });

    if (!venda) {
      throw new NotFoundException(
        'Pedido não encontrado ou não pertence a este cliente',
      );
    }

    const statusLabel: Record<StatusVenda, string> = {
      [StatusVenda.PENDENTE]: 'Aguardando pagamento',
      [StatusVenda.APROVADO]: 'Pagamento confirmado ✅',
      [StatusVenda.CANCELADO]: 'Pedido cancelado',
      [StatusVenda.RECUSADO]: 'Pagamento recusado',
    };

    let statusGateway: string | undefined;

    // Polling no gateway se pendente e com gatewayId
    if (venda.status === StatusVenda.PENDENTE && venda.gatewayId) {
      try {
        const gateway = this.paymentGatewayFactory.getGateway(
          venda.tipoPagamento,
        );
        const resultado = await gateway.consultarCobranca(venda.gatewayId);
        statusGateway = resultado.status;
      } catch (error) {
        this.logger.warn(
          `Erro ao consultar gateway para venda ${pedidoId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return {
      message: 'Status do pagamento consultado',
      data: {
        pedidoId: venda.id,
        status: venda.status,
        statusLabel: statusLabel[venda.status],
        statusGateway,
        total: venda.total.toString(),
        criadoEm: venda.createdAt,
        pago: venda.status === StatusVenda.APROVADO,
      },
    };
  }

  // ─── WEBHOOK PAGAMENTO ────────────────────────────────────────────────────

  /**
   * Alias do webhook PagBank para o canal WhatsApp.
   * Delega ao PagamentosService — mesma lógica de confirmação.
   */
  async processarWebhookPagamento(body: Record<string, unknown>) {
    this.logger.log(
      'Webhook WhatsApp API recebido — delegando ao PagamentosService',
    );
    return this.pagamentosService.processarWebhookPix(body);
  }

  // ─── CARTELAS COMPRADAS ────────────────────────────────────────────────────

  /**
   * Retorna os números/bilhetes de um pedido aprovado.
   * Equivalente ao "Meus Números" da loja pública.
   */
  async consultarCartelas(pedidoId: string, clienteId: string) {
    const venda = await this.prisma.venda.findFirst({
      where: { id: pedidoId, clienteId },
      include: {
        edicao: {
          select: {
            id: true,
            numero: true,
            dataSorteio: true,
            qtdNumerosCartela: true,
          },
        },
        bilhetes: { orderBy: { numero: 'asc' } },
      },
    });

    if (!venda) {
      throw new NotFoundException(
        'Pedido não encontrado ou não pertence a este cliente',
      );
    }

    if (venda.status !== StatusVenda.APROVADO) {
      return {
        message: 'Pedido ainda não confirmado',
        data: {
          pedidoId: venda.id,
          status: venda.status,
          statusLabel:
            venda.status === StatusVenda.PENDENTE
              ? 'Aguardando pagamento'
              : 'Pedido cancelado/recusado',
          cartelas: [],
        },
      };
    }

    const quantidadeCartelasPorCombo = venda.tipoCartela
      ? obterQuantidadeCartelas(venda.tipoCartela)
      : 1;
    const totalBilhetes = venda.bilhetes.length;
    const totalCartelas = totalBilhetes / quantidadeCartelasPorCombo;

    // Agrupar bilhetes em cartelas/combos
    const cartelas: Array<{
      ordemCartela: number;
      bilhetes: Array<{ numero: string; sequenciaBolas: number[] }>;
    }> = [];

    for (let i = 0; i < totalBilhetes; i += quantidadeCartelasPorCombo) {
      const grupo = venda.bilhetes.slice(i, i + quantidadeCartelasPorCombo);
      cartelas.push({
        ordemCartela: Math.floor(i / quantidadeCartelasPorCombo) + 1,
        bilhetes: grupo.map((b) => ({
          numero: b.numero.toString().padStart(7, '0'),
          sequenciaBolas: b.sequenciaBolas,
        })),
      });
    }

    return {
      message: 'Cartelas encontradas com sucesso',
      data: {
        pedidoId: venda.id,
        status: venda.status,
        campanha: {
          id: venda.edicao.id,
          numero: venda.edicao.numero,
          dataSorteio: venda.edicao.dataSorteio,
          qtdNumerosCartela: venda.edicao.qtdNumerosCartela,
        },
        totalCartelas,
        totalBilhetes,
        quantidadeCartelasPorCombo,
        cartelas,
      },
    };
  }

  // ─── CONSULTAR PEDIDOS ────────────────────────────────────────────────────

  /**
   * Lista pedidos do cliente autenticado, com filtros opcionais.
   * Segurança: sempre restrito ao clienteId do JWT.
   */
  async consultarPedidos(
    clienteId: string,
    filtros: ConsultarPedidosWhatsappDto,
  ) {
    // Validar cliente
    const cliente = await this.prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, telefone: true },
    });

    if (!cliente) {
      throw new UnauthorizedException('Cliente não encontrado');
    }

    // Validar filtro de telefone (confirmação — não permite acesso a outros clientes)
    if (filtros.telefone) {
      const telefoneLimpo = filtros.telefone.replace(/\D/g, '');
      const clienteTelefone = cliente.telefone?.replace(/\D/g, '');
      if (telefoneLimpo !== clienteTelefone) {
        throw new BadRequestException(
          'O telefone informado não corresponde ao cadastro do cliente autenticado',
        );
      }
    }

    const page = filtros.page ?? 1;
    const limit = Math.min(filtros.limit ?? 10, 50);
    const skip = (page - 1) * limit;

    const where: Prisma.VendaWhereInput = {
      clienteId,
      ...(filtros.pedidoId ? { id: filtros.pedidoId } : {}),
    };

    const [vendas, total] = await Promise.all([
      this.prisma.venda.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          tipoPagamento: true,
          tipoCartela: true,
          quantidade: true,
          total: true,
          gatewayId: true,
          createdAt: true,
          edicao: {
            select: { id: true, numero: true, dataSorteio: true },
          },
          bilhetes: { select: { numero: true }, orderBy: { numero: 'asc' } },
        },
      }),
      this.prisma.venda.count({ where }),
    ]);

    const statusLabel: Record<StatusVenda, string> = {
      [StatusVenda.PENDENTE]: 'Aguardando pagamento',
      [StatusVenda.APROVADO]: 'Pagamento confirmado ✅',
      [StatusVenda.CANCELADO]: 'Cancelado',
      [StatusVenda.RECUSADO]: 'Recusado',
    };

    return {
      message: total > 0 ? 'Pedidos encontrados' : 'Nenhum pedido encontrado',
      data: {
        total,
        page,
        totalPages: Math.ceil(total / limit),
        pedidos: vendas.map((v) => {
          const quantidadeCartelasPorCombo = v.tipoCartela
            ? obterQuantidadeCartelas(v.tipoCartela)
            : 1;
          const quantidadeCartelas = this.obterQuantidadeCartelasDaCompra(
            v.quantidade,
            v.tipoCartela,
            v.bilhetes.length,
          );

          return {
            pedidoId: v.id,
            status: v.status,
            statusLabel: statusLabel[v.status],
            campanha: {
              id: v.edicao.id,
              numero: v.edicao.numero,
              dataSorteio: v.edicao.dataSorteio,
            },
            quantidade: quantidadeCartelas,
            quantidadeCombos: v.quantidade,
            quantidadeCartelasPorCombo,
            quantidadeCartelas,
            totalBilhetes: v.bilhetes.length,
            total: v.total.toString(),
            totalFormatado: new Intl.NumberFormat('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            }).format(Number(v.total)),
            criadoEm: v.createdAt,
            temCartelas: v.bilhetes.length > 0,
          };
        }),
      },
    };
  }

  // ─── DETALHE DE PEDIDO ────────────────────────────────────────────────────

  async detalharPedido(pedidoId: string, clienteId: string) {
    const venda = await this.prisma.venda.findFirst({
      where: { id: pedidoId, clienteId },
      select: {
        id: true,
        status: true,
        tipoPagamento: true,
        tipoCartela: true,
        quantidade: true,
        total: true,
        gatewayId: true,
        createdAt: true,
        edicao: {
          select: {
            id: true,
            numero: true,
            dataSorteio: true,
            dataEncerramento: true,
            qtdNumerosCartela: true,
          },
        },
        bilhetes: {
          select: { numero: true, sequenciaBolas: true },
          orderBy: { numero: 'asc' },
        },
      },
    });

    if (!venda) {
      throw new NotFoundException(
        'Pedido não encontrado ou não pertence a este cliente',
      );
    }

    const statusLabel: Record<StatusVenda, string> = {
      [StatusVenda.PENDENTE]: 'Aguardando pagamento',
      [StatusVenda.APROVADO]: 'Pagamento confirmado ✅',
      [StatusVenda.CANCELADO]: 'Cancelado',
      [StatusVenda.RECUSADO]: 'Recusado',
    };
    const quantidadeCartelas = this.obterQuantidadeCartelasDaCompra(
      venda.quantidade,
      venda.tipoCartela,
      venda.bilhetes.length,
    );
    const quantidadeCartelasPorCombo = venda.tipoCartela
      ? obterQuantidadeCartelas(venda.tipoCartela)
      : 1;

    return {
      message: 'Pedido encontrado',
      data: {
        pedidoId: venda.id,
        status: venda.status,
        statusLabel: statusLabel[venda.status],
        campanha: {
          id: venda.edicao.id,
          numero: venda.edicao.numero,
          dataSorteio: venda.edicao.dataSorteio,
          dataEncerramento: venda.edicao.dataEncerramento,
          qtdNumerosCartela: venda.edicao.qtdNumerosCartela,
        },
        quantidade: quantidadeCartelas,
        quantidadeCombos: venda.quantidade,
        quantidadeCartelasPorCombo,
        quantidadeCartelas,
        total: venda.total.toString(),
        totalFormatado: new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }).format(Number(venda.total)),
        criadoEm: venda.createdAt,
        totalBilhetes: venda.bilhetes.length,
        bilhetes: venda.bilhetes.map((b) => ({
          numero: b.numero.toString().padStart(7, '0'),
          sequenciaBolas: b.sequenciaBolas,
        })),
      },
    };
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  private mapearOpcoesCompraDaCampanha(
    combos: Array<{
      origemParticipacao: OrigemParticipacao;
      tipoCartela: TipoCartela;
      preco: Prisma.Decimal;
    }>,
    valorCartela: Prisma.Decimal,
  ): OpcaoCompraWhatsapp[] {
    const valorUnitarioCartela = this.formatarValorMonetario(valorCartela);
    const opcoes: OpcaoCompraWhatsapp[] = [
      {
        tipoCompra: 'UNITARIO',
        isCombo: false,
        quantidadeCartelas: 1,
        valorUnitarioCartela,
        valorUnitario: valorUnitarioCartela,
        valorCombo: null,
        preco: valorUnitarioCartela,
        precoFormatado: this.formatarMoeda(Number(valorUnitarioCartela)),
      },
    ];

    const combosDigitais = combos
      .filter(
        (combo) =>
          combo.origemParticipacao === OrigemParticipacao.DIGITAL &&
          combo.tipoCartela !== TipoCartela.UMA_CHANCE,
      )
      .map((combo) => {
        const quantidadeCartelas = obterQuantidadeCartelas(combo.tipoCartela);
        const valorCombo = this.formatarValorMonetario(combo.preco);

        return {
          tipoCompra: 'COMBO' as const,
          isCombo: true,
          quantidadeCartelas,
          valorUnitarioCartela,
          valorUnitario: valorUnitarioCartela,
          valorCombo,
          preco: valorCombo,
          precoFormatado: this.formatarMoeda(Number(valorCombo)),
        };
      });

    return [...opcoes, ...combosDigitais];
  }

  private isCartelaUnitaria(tipoCartela: TipoCartela): boolean {
    return tipoCartela === TipoCartela.UMA_CHANCE;
  }

  private obterQuantidadeCartelasDaCompra(
    quantidade: number,
    tipoCartela?: TipoCartela | null,
    quantidadeBilhetes?: number,
  ): number {
    if (quantidadeBilhetes !== undefined && quantidadeBilhetes > 0) {
      return quantidadeBilhetes;
    }

    return (
      quantidade * (tipoCartela ? obterQuantidadeCartelas(tipoCartela) : 1)
    );
  }

  private formatarValorMonetario(valor: Prisma.Decimal | number): string {
    return Number(valor).toFixed(2);
  }

  private formatarMoeda(valor: Prisma.Decimal | number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Number(valor));
  }

  private resolverTipoCartela(
    dto: Pick<CriarPedidoWhatsappDto, 'tipoCartela' | 'quantidadeCartelas'>,
  ): TipoCartela {
    const tipoCartelaPelaQuantidade =
      dto.quantidadeCartelas !== undefined
        ? obterTipoCartelaPorQuantidadeCartelas(dto.quantidadeCartelas)
        : null;

    if (dto.quantidadeCartelas !== undefined && !tipoCartelaPelaQuantidade) {
      throw new BadRequestException(
        `quantidadeCartelas inválida: ${dto.quantidadeCartelas}. Informe um valor entre 1 e 12`,
      );
    }

    if (
      dto.tipoCartela &&
      tipoCartelaPelaQuantidade &&
      dto.tipoCartela !== tipoCartelaPelaQuantidade
    ) {
      throw new BadRequestException(
        `Conflito entre o campo legado de cartelas e quantidadeCartelas (${dto.quantidadeCartelas})`,
      );
    }

    return (
      dto.tipoCartela ?? tipoCartelaPelaQuantidade ?? TipoCartela.UMA_CHANCE
    );
  }

  private mascararCpf(cpf: string): string {
    return `${cpf.substring(0, 3)}.***.***-${cpf.substring(9, 11)}`;
  }

  private getAccessTokenOptions(): JwtSignOptions {
    return {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>(
        'JWT_ACCESS_EXPIRES',
        '15m',
      ) as JwtSignOptions['expiresIn'],
    };
  }

  private getRefreshTokenOptions(): JwtSignOptions {
    return {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>(
        'JWT_REFRESH_EXPIRES',
        '7d',
      ) as JwtSignOptions['expiresIn'],
    };
  }
}
