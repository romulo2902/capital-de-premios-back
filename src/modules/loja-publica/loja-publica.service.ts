import {
  Injectable,
  NotFoundException,
  BadRequestException,
  BadGatewayException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { VendasService } from '../vendas/vendas.service';
import { ComprarLojaDto } from './dto/comprar-loja.dto';
import { ReservarCartelasDto } from './dto/reservar-cartelas.dto';
import {
  StatusEdicao,
  StatusVenda,
  TipoPagamento,
  OrigemParticipacao,
  Prisma,
  TipoCartela,
  EdicaoCombo,
  Perfil,
} from '@prisma/client';
import { ConteudoService } from '../conteudo/conteudo.service';
import {
  obterQuantidadeCartelas,
  obterTipoCartelaPorQuantidadeCartelas,
} from '../edicoes/edicoes-range.util';
import {
  criarExcecaoEdicaoEmManutencao,
  serializarEstadoManutencao,
} from '../edicoes/edicao-manutencao.util';
import { PaymentGatewayFactory } from '../pagamentos/gateways/payment-gateway.factory';
import { ListarCartelasLojaDto } from './dto/listar-cartelas-loja.dto';
import { CreateFaleConoscoDto } from './dto/create-fale-conosco.dto';
import { getRequestContext } from '../../common/request-context/request-context.util';
import { RedisService } from '../../common/redis/redis.service';
import { calcularQuantidadeCartelasDaVenda } from '../vendas/vendas-quantidade.util';
import { mapearErroPagamento } from '../../common/errors/payment-error.util';
import {
  parseEValidarDataNascimento,
  validarMaioridade,
} from '../../common/utils/data-nascimento.util';

export type TipoCompraEdicao = 'UNITARIO' | 'COMBO';

export interface OpcaoCompraEdicao {
  id?: string;
  tipoCartela?: TipoCartela;
  tipoCompra: TipoCompraEdicao;
  isCombo: boolean;
  quantidadeCartelas: number;
  valorUnitarioCartela: string;
  valorUnitario: string;
  valorCombo: string | null;
  preco: string;
  rangeTotalInicio: string;
  rangeTotalFinal: string;
  passoEntreCartelas: string;
  setores: Array<{
    indiceCartela: number;
    rangeInicio: string;
    rangeFinal: string;
  }>;
}

interface SellerOrigemResolvida {
  vendedorId: string | null;
  distribuidorId: string | null;
}

interface EntidadeSellerIdentificada {
  vendedorId: string | null;
  distribuidorId: string | null;
}

interface AtualizacaoRelacionamentoCliente {
  vendedorId?: string | null;
  distribuidorId?: string | null;
}

@Injectable()
export class LojaPublicaService {
  private readonly logger = new Logger(LojaPublicaService.name);
  private static readonly CONTATO_COOLDOWN_SEGUNDOS = 120;
  private static readonly CONTATO_LIMITE_IP_JANELA_SEGUNDOS = 600;
  private static readonly CONTATO_LIMITE_IP_MAXIMO = 8;
  private static readonly CONTATO_LIMITE_CPF_JANELA_SEGUNDOS = 3600;
  private static readonly CONTATO_LIMITE_CPF_MAXIMO = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vendasService: VendasService,
    private readonly conteudoService: ConteudoService,
    private readonly config: ConfigService,
    private readonly paymentGatewayFactory: PaymentGatewayFactory,
    private readonly redisService: RedisService,
  ) {}

  async getHome() {
    const edicaoAtiva = await this.prisma.edicao.findFirst({
      where: { status: StatusEdicao.ATIVA },
      include: {
        premios: { orderBy: { ordem: 'asc' } },
        combos: {
          where: { origemParticipacao: OrigemParticipacao.DIGITAL },
          orderBy: { tipoCartela: 'asc' },
        },
      },
    });

    if (!edicaoAtiva) {
      return { message: 'Nenhuma edição ativa no momento', data: null };
    }

    const opcoesDeCompra = this.mapearOpcoesCompraDaEdicao(edicaoAtiva.combos);
    const valorUnitarioCartela = this.formatarValorMonetario(
      edicaoAtiva.valorCartela,
    );

    return {
      message: 'Dados da home carregados com sucesso',
      data: {
        edicao: {
          id: edicaoAtiva.id,
          numero: edicaoAtiva.numero,
          dataSorteio: edicaoAtiva.dataSorteio,
          dataEncerramento: edicaoAtiva.dataEncerramento,
          frase: edicaoAtiva.frase,
          imagemUrl: edicaoAtiva.imagemUrl,
          status: edicaoAtiva.status,
          valorCartela: valorUnitarioCartela,
          valorUnitarioCartela,
          qtdNumerosCartela: edicaoAtiva.qtdNumerosCartela,
          ...serializarEstadoManutencao(edicaoAtiva),
        },
        premios: edicaoAtiva.premios.map((p) => ({
          ordem: p.ordem,
          descricao: p.descricao,
          valor: p.valor.toString(),
          imagemUrl: p.imagemUrl,
        })),
        opcoes: opcoesDeCompra,
        countdown: {
          dataSorteio: edicaoAtiva.dataSorteio,
          serverTime: new Date(),
        },
      },
    };
  }

  async getEdicaoAtiva() {
    return this.getHome(); // Serve the same data since home essentially focuses on the active edition
  }

  async listarCartelasDisponiveis(
    edicaoId: string,
    filtros: ListarCartelasLojaDto,
  ) {
    let numerosReservados: string[] = [];
    if (this.redisService.isConfigured() && this.redisService.client) {
      const keys = await this.redisService.client.keys(`reserva:${edicaoId}:*`);
      numerosReservados = keys.map((k) => k.split(':').pop()!).filter(Boolean);
    }

    const result = await this.vendasService.listarCombosDisponiveis({
      edicaoId,
      origemParticipacao:
        filtros.origemParticipacao ?? OrigemParticipacao.DIGITAL,
      tipoCartela: filtros.tipoCartela,
      quantidadeCartelas:
        filtros.quantidadeCartelas ?? (filtros.tipoCartela ? undefined : 1),
      limit: filtros.limit ?? 5,
      indiceRange: filtros.indiceRange,
      numerosReservados,
    });

    // Mapeia para o formato simplificado solicitado pelo frontend
    return {
      data: result.data.combos.map((combo) => ({
        numero: combo.numeroBase,
        numeros: combo.bilhetes[0]?.sequenciaBolas ?? [],
      })),
    };
  }

  async comprar(dto: ComprarLojaDto) {
    const edicao = await this.prisma.edicao.findUnique({
      where: { id: dto.edicaoId },
      include: {
        combos: {
          where: {
            origemParticipacao: OrigemParticipacao.DIGITAL,
          },
          orderBy: { tipoCartela: 'asc' },
        },
      },
    });

    if (!edicao) throw new NotFoundException('Edição não encontrada');
    if (edicao.status !== StatusEdicao.ATIVA)
      throw new BadRequestException('Edição não está ativa');
    this.validarEdicaoForaDeManutencao(edicao);
    this.validarJanelaDeVenda(edicao.numero, edicao.dataEncerramento);

    let comboSelecionado: EdicaoCombo | undefined;
    if (dto.comboId) {
      comboSelecionado = edicao.combos.find((c) => c.id === dto.comboId);
      if (!comboSelecionado) {
        throw new BadRequestException(
          'Combo selecionado não foi encontrado na edição',
        );
      }
    } else {
      comboSelecionado =
        edicao.combos.find((c) => c.tipoCartela === TipoCartela.UMA_CHANCE) ??
        edicao.combos[0];
      if (!comboSelecionado) {
        throw new BadRequestException(
          'A edição não possui combos configurados para o site',
        );
      }
    }
    const tipoCartelaSelecionada = comboSelecionado.tipoCartela;

    if (dto.cartelasSelecionadas && dto.cartelasSelecionadas.length > 0) {
      if (dto.comboId) {
        throw new BadRequestException(
          'Não é permitido selecionar cartelas explicitamente em compras de combos',
        );
      }
      if (dto.cartelasSelecionadas.length !== dto.quantidadeCartelas) {
        throw new BadRequestException(
          'A quantidade de cartelas selecionadas deve ser igual à quantidade da compra',
        );
      }
    }

    // Calcula total — todo combo carrega seu próprio preço e range
    const valorSelecionado = Number(comboSelecionado.preco);
    const total = valorSelecionado * dto.quantidadeCartelas;

    if (Math.abs(total - dto.valor) > 0.01) {
      throw new BadRequestException(
        `O valor total calculado (R$ ${total.toFixed(2)}) difere do valor enviado (R$ ${dto.valor.toFixed(2)})`,
      );
    }

    const sellerOrigem = await this.resolverSellerOrigem(dto.seller_id);
    this.logger.log(
      `Checkout loja seller_id=${dto.seller_id ?? 'N/A'} -> vendedorId=${
        sellerOrigem.vendedorId ?? 'null'
      } distribuidorId=${sellerOrigem.distribuidorId ?? 'null'}`,
    );

    let cliente;
    if (dto.clienteId) {
      cliente = await this.vendasService.buscarClientePorIdParaCompra(
        dto.clienteId,
        sellerOrigem.vendedorId ?? undefined,
        sellerOrigem.distribuidorId ?? undefined,
      );
    } else {
      if (!dto.cpf || !dto.nome || !dto.telefone || !dto.dataNascimento) {
        throw new BadRequestException(
          'Informe clienteId ou os dados completos do cliente para concluir a compra',
        );
      }

      const cpfLimpo = dto.cpf.replace(/\D/g, '');
      const emailNormalizado = dto.email?.trim() || null;
      const dataNascimento = parseEValidarDataNascimento(dto.dataNascimento);
      const relacionamentoCliente = this.buildRelacionamentoClienteMaisRecente(
        dto.seller_id,
        sellerOrigem,
      );
      cliente = await this.prisma.cliente.findUnique({
        where: { cpf: cpfLimpo },
      });
      if (!cliente) {
        cliente = await this.prisma.cliente.create({
          data: {
            cpf: cpfLimpo,
            nome: dto.nome,
            telefone: dto.telefone,
            email: emailNormalizado,
            dataNascimento,
            vendedorId: relacionamentoCliente.vendedorId ?? null,
            distribuidorId: relacionamentoCliente.distribuidorId ?? null,
          },
        });
      } else if (!cliente.dataNascimento) {
        cliente = await this.prisma.cliente.update({
          where: { id: cliente.id },
          data: {
            dataNascimento,
            ...relacionamentoCliente,
          },
        });
      } else {
        validarMaioridade(cliente.dataNascimento);

        if (Object.keys(relacionamentoCliente).length > 0) {
          cliente = await this.prisma.cliente.update({
            where: { id: cliente.id },
            data: relacionamentoCliente,
          });
        }
      }
    }

    const dadosClientePagamento =
      this.vendasService.validarDadosClienteParaPagamento(cliente);

    const venda = await this.prisma.venda.create({
      data: {
        edicaoId: edicao.id,
        clienteId: cliente.id,
        vendedorId: sellerOrigem.vendedorId,
        distribuidorId: sellerOrigem.distribuidorId,
        quantidade: dto.quantidadeCartelas,
        tipoCartela: tipoCartelaSelecionada,
        total: new Prisma.Decimal(total.toFixed(2)),
        status: StatusVenda.PENDENTE,
        origemParticipacao: OrigemParticipacao.DIGITAL,
        tipoPagamento: TipoPagamento.PIX,
        gatewayPayload: {
          origem: 'WEB',
          ...(dto.cartelasSelecionadas
            ? {
                combosSelecionados: dto.cartelasSelecionadas.map((numero) => ({
                  numeroBase: numero,
                })),
              }
            : {}),
        } as Prisma.InputJsonValue,
      },
    });
    this.logger.log(
      `Venda pública criada ${venda.id} com vendedorId=${
        sellerOrigem.vendedorId ?? 'null'
      } distribuidorId=${sellerOrigem.distribuidorId ?? 'null'}`,
    );

    const mockPagamentoAprovado = this.isMockPagamentoAprovado();

    if (mockPagamentoAprovado) {
      const gatewayIdMock = `mockpix${venda.id.replace(/-/g, '').slice(0, 27)}`;

      await this.prisma.venda.update({
        where: { id: venda.id },
        data: {
          gatewayId: gatewayIdMock,
          gatewayPayload: {
            ...((venda.gatewayPayload as Record<string, unknown> | null) ?? {}),
            mock: true,
            ambiente: this.config.get<string>('NODE_ENV', 'development'),
            motivo: 'Aprovação automática habilitada por flag de ambiente',
          },
        },
      });

      await this.vendasService.confirmarPagamento(venda.id, {
        mock: true,
        txid: gatewayIdMock,
        horario: new Date().toISOString(),
        valor: total.toFixed(2),
      });

      const vendaAprovada = await this.prisma.venda.findUnique({
        where: { id: venda.id },
        select: {
          id: true,
          total: true,
          status: true,
          gatewayId: true,
        },
      });

      this.logger.log(`Pagamento mock autoaprovado para venda ${venda.id}`);

      return {
        message: 'Pedido criado e aprovado com sucesso (mock)',
        data: {
          vendaId: venda.id,
          total: vendaAprovada?.total.toString() ?? venda.total.toString(),
          tipoCompra: 'COMBO',
          valorUnitarioCartela: this.formatarValorMonetario(
            edicao.valorCartela,
          ),
          valorCombo: this.formatarValorMonetario(comboSelecionado.preco),
          quantidadeCartelas: dto.quantidadeCartelas,
          status: vendaAprovada?.status ?? StatusVenda.APROVADO,
          pagamento: {
            mock: true,
            gatewayId: vendaAprovada?.gatewayId ?? gatewayIdMock,
            status: 'APROVADO',
            pixCopiaECola: 'MOCK_PIX_APROVADO',
          },
        },
      };
    }

    // Create PIX charge
    let dadosPagamento = {};
    try {
      const gateway = this.paymentGatewayFactory.getGateway(TipoPagamento.PIX);
      const cobranca = await gateway.criarCobranca({
        vendaId: venda.id,
        valorCentavos: Math.round(total * 100),
        quantidadeItens: dto.quantidadeCartelas,
        valorUnitarioCentavos: Math.round(valorSelecionado * 100),
        descricao: `Capital de Prêmios - Edição ${edicao.numero} - ${dto.quantidadeCartelas} iten(s)`,
        cpfPagador: dadosClientePagamento.cpf,
        nomePagador: dadosClientePagamento.nome,
        emailPagador: dadosClientePagamento.email,
        telefonePagador: dadosClientePagamento.telefone,
        expiracaoSegundos: 3600,
      });

      await this.prisma.venda.update({
        where: { id: venda.id },
        data: {
          gatewayId: cobranca.gatewayId,
          gatewayPayload: {
            ...((venda.gatewayPayload as Record<string, unknown> | null) ?? {}),
            ...(cobranca.payload as Record<string, unknown>),
          } as Prisma.InputJsonValue,
        },
      });
      dadosPagamento = {
        pixCopiaECola: cobranca.pixCopiaECola,
        qrCodeBase64: cobranca.qrCodeBase64,
        urlPagamento: cobranca.urlPagamento,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Erro ao criar cobrança PIX para venda ${venda.id}: ${errorMessage}`,
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
      message: 'Pedido criado com sucesso',
      data: {
        vendaId: venda.id,
        total: venda.total.toString(),
        tipoCompra: 'COMBO',
        valorUnitarioCartela: this.formatarValorMonetario(edicao.valorCartela),
        valorCombo: this.formatarValorMonetario(comboSelecionado.preco),
        quantidadeCartelas: dto.quantidadeCartelas,
        pagamento: dadosPagamento,
      },
    };
  }

  async reservarCartelas(dto: ReservarCartelasDto) {
    const edicao = await this.prisma.edicao.findUnique({
      where: { id: dto.edicaoId },
      select: { id: true, status: true },
    });

    if (!edicao) {
      throw new NotFoundException('Edição não encontrada');
    }
    if (edicao.status !== StatusEdicao.ATIVA) {
      throw new BadRequestException('A edição não está ativa');
    }

    // Verificar se os números já estão comprados
    const bilhetesComprados = await this.prisma.bilhete.findMany({
      where: {
        edicaoId: edicao.id,
        numero: { in: dto.cartelas.map((n) => BigInt(n)) },
      },
      select: { numero: true },
    });

    if (bilhetesComprados.length > 0) {
      throw new BadRequestException(
        'Algumas cartelas selecionadas já foram vendidas',
      );
    }

    // Registrar no Redis (TTL de 5 minutos = 300 segundos)
    if (this.redisService.isConfigured() && this.redisService.client) {
      for (const numero of dto.cartelas) {
        const key = `reserva:${edicao.id}:${numero}`;
        await this.redisService.client.setex(key, 300, Date.now().toString());
      }
    }

    return {
      message: 'Cartelas reservadas com sucesso',
      data: {
        reservadas: dto.cartelas.length,
        expiresIn: 300,
      },
    };
  }

  async enviarFaleConosco(dto: CreateFaleConoscoDto) {
    if (dto.website?.trim()) {
      this.logger.warn(
        `Tentativa de spam no formulário "Fale Conosco" bloqueada por honeypot (requestId: ${getRequestContext()?.requestId ?? 'n/a'})`,
      );

      return {
        message: 'Mensagem enviada com sucesso',
        data: { protocolo: null },
      };
    }

    const nome = this.normalizarTexto(dto.nome);
    const cpf = this.normalizarCpf(dto.cpf);
    const email = dto.email.trim().toLowerCase();
    const telefone = this.normalizarTelefone(dto.telefone);
    const mensagem = this.normalizarTexto(dto.mensagem);

    await this.validarLimitesContato(cpf);
    await this.validarCooldownContato(cpf, email, mensagem);

    const contexto = getRequestContext();
    const fingerprint = this.gerarFingerprintContato(cpf, email, mensagem);

    const contato = await this.prisma.contatoMensagem.create({
      data: {
        nome,
        cpf,
        email,
        telefone,
        mensagem,
        fingerprint,
        ip: contexto?.ip ?? null,
        userAgent: contexto?.userAgent ?? null,
      },
    });

    this.logger.log(`Nova mensagem recebida no Fale Conosco: ${contato.id}`);

    return {
      message: 'Mensagem enviada com sucesso',
      data: { protocolo: contato.id },
    };
  }

  private isMockPagamentoAprovado(): boolean {
    return this.config.get<string>('MOCK_PIX_AUTO_APPROVE', 'false') === 'true';
  }

  async consultarNumeros(cpf: string) {
    const cpfLimpo = cpf.replace(/\D/g, '');
    const cliente = await this.prisma.cliente.findUnique({
      where: { cpf: cpfLimpo },
    });

    if (!cliente)
      throw new NotFoundException('Nenhum cadastro encontrado para este CPF');

    const vendas = await this.prisma.venda.findMany({
      where: {
        clienteId: cliente.id,
        status: StatusVenda.APROVADO,
      },
      include: {
        edicao: {
          include: {
            premios: { orderBy: { ordem: 'asc' } },
            combos: {
              where: { origemParticipacao: OrigemParticipacao.DIGITAL },
              orderBy: { tipoCartela: 'asc' },
            },
          },
        },
        bilhetes: {
          orderBy: { numero: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    this.logger.log(
      `Consulta pública de bilhetes para CPF ${cpfLimpo} retornou ${vendas.length} compra(s) aprovada(s)`,
    );

    const cpfMascarado = this.mascararCPF(cliente.cpf);
    const emailMascarado = this.mascararEmail(cliente.email);

    return {
      message: 'Bilhetes encontrados',
      data: {
        cliente: {
          nome: cliente.nome,
          cpf: cpfMascarado,
          cpfMascarado,
          email: emailMascarado,
          emailMascarado,
          telefone: cliente.telefone,
        },
        compras: vendas.map((v) => {
          const quantidadeCartelasPorCombo = v.tipoCartela
            ? obterQuantidadeCartelas(v.tipoCartela)
            : 1;
          const quantidadeCartelas = calcularQuantidadeCartelasDaVenda({
            quantidade: v.quantidade,
            tipoCartela: v.tipoCartela,
            quantidadeBilhetes: v.bilhetes.length,
          });

          return {
            vendaId: v.id,
            numeroPedido: v.id,
            status: v.status,
            statusLabel: this.mapearStatusVenda(v.status),
            tipoPagamento: v.tipoPagamento,
            tipoPagamentoLabel: this.mapearTipoPagamento(v.tipoPagamento),
            quantidade: quantidadeCartelas,
            quantidadeCombos: v.quantidade,
            quantidadeCartelasPorCombo,
            quantidadeCartelas,
            quantidadeBilhetes: v.bilhetes.length,
            total: v.total.toString(),
            totalFormatado: this.formatarMoeda(v.total),
            dataCompra: v.createdAt,
            dataCompraFormatada: this.formatarDataHora(v.createdAt),
            titular: {
              nome: cliente.nome,
              cpf: cpfMascarado,
              email: emailMascarado,
              telefone: cliente.telefone,
            },
            edicao: {
              id: v.edicao.id,
              numero: v.edicao.numero,
              dataSorteio: v.edicao.dataSorteio,
              dataSorteioFormatada: this.formatarData(v.edicao.dataSorteio),
              dataEncerramento: v.edicao.dataEncerramento,
              dataEncerramentoFormatada: this.formatarDataHora(
                v.edicao.dataEncerramento,
              ),
              imagemUrl: v.edicao.imagemUrl,
              frase: v.edicao.frase,
              valorCartela: this.formatarValorMonetario(v.edicao.valorCartela),
              valorUnitarioCartela: this.formatarValorMonetario(
                v.edicao.valorCartela,
              ),
              valorCartelaFormatado: this.formatarMoeda(v.edicao.valorCartela),
              qtdNumerosCartela: v.edicao.qtdNumerosCartela,
              manutencaoAtiva: v.edicao.manutencaoAtiva,
              manutencaoMensagem: v.edicao.manutencaoMensagem,
              vendasBloqueadas: v.edicao.manutencaoAtiva,
              opcoesCompra: this.mapearOpcoesCompraDaEdicao(
                v.edicao.combos,
              ).map((opcao) => ({
                tipoCompra: opcao.tipoCompra,
                isCombo: opcao.isCombo,
                quantidadeCartelas: opcao.quantidadeCartelas,
                valorUnitarioCartela: opcao.valorUnitarioCartela,
                valorCombo: opcao.valorCombo,
                preco: opcao.preco,
                precoFormatado: this.formatarMoeda(Number(opcao.preco)),
              })),
              premios: v.edicao.premios.map((p) => ({
                ordem: p.ordem,
                descricao: p.descricao,
                valor: p.valor.toString(),
                valorFormatado: this.formatarMoeda(p.valor),
                imagemUrl: p.imagemUrl,
              })),
            },
            resumo: {
              titulo: `EDIÇÃO ${String(v.edicao.numero).padStart(2, '0')} | ${this.formatarData(v.edicao.dataSorteio)}`,
              subtitulo: `${quantidadeCartelas} cartela(s) com ${v.edicao.qtdNumerosCartela} número(s) por bilhete`,
            },
            combos: this.agruparBilhetesPorCombo(
              v.bilhetes,
              v.edicao.combos,
              v.tipoCartela,
            ),
            bilhetes: v.bilhetes.map((b) => ({
              numero: this.formatarNumeroBilhete(b.numero),
              sequenciaBolas: b.sequenciaBolas,
            })),
          };
        }),
      },
    };
  }

  async getResultados() {
    const edicoes = await this.prisma.edicao.findMany({
      where: { status: StatusEdicao.FINALIZADA },
      include: { resultado: true, premios: { include: { edicao: false } } }, // Add logic to fetch winners
      orderBy: { dataSorteio: 'desc' },
      take: 10,
    });

    return {
      message: 'Resultados carregados',
      data: edicoes.map((e) => ({
        id: e.id,
        numero: e.numero,
        dataSorteio: e.dataSorteio,
        resultado: e.resultado ? e.resultado.numerosApurados : null,
      })),
    };
  }

  async getPagina(slug: string) {
    return this.conteudoService.findBySlug(slug);
  }

  private mapearStatusVenda(status: StatusVenda): string {
    const labels: Record<StatusVenda, string> = {
      [StatusVenda.PENDENTE]: 'Pendente',
      [StatusVenda.APROVADO]: 'Pago',
      [StatusVenda.RECUSADO]: 'Recusado',
      [StatusVenda.CANCELADO]: 'Cancelado',
    };

    return labels[status];
  }

  private mapearTipoPagamento(tipoPagamento: TipoPagamento): string {
    const labels: Record<TipoPagamento, string> = {
      [TipoPagamento.PIX]: 'PIX',
      [TipoPagamento.CARTAO]: 'Cartão',
      [TipoPagamento.MANUAL]: 'Manual',
    };

    return labels[tipoPagamento];
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

  private mascararCPF(cpf: string): string {
    return `${cpf.substring(0, 3)}.***.***-${cpf.substring(9, 11)}`;
  }

  private mascararEmail(email: string | null): string | null {
    if (!email) {
      return null;
    }

    const [usuario, dominio] = email.split('@');
    const prefixo = usuario.substring(0, 3);
    return `${prefixo}***@${dominio}`;
  }

  private formatarMoeda(valor: Prisma.Decimal | number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Number(valor));
  }

  private formatarValorMonetario(valor: Prisma.Decimal | number): string {
    return Number(valor).toFixed(2);
  }

  private formatarData(data: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(data);
  }

  private formatarDataHora(data: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(data);
  }

  private expandirSetoresDoCombo(
    combo: { rangeInicio: bigint; rangeFinal: bigint },
    quantidadeCartelas: number,
  ): Array<{
    rangeInicio: bigint;
    rangeFinal: bigint;
    rangeTotalInicio: bigint;
    rangeTotalFinal: bigint;
  }> {
    return Array.from({ length: quantidadeCartelas }, (_, i) => ({
      rangeInicio: combo.rangeInicio + BigInt(i),
      rangeFinal: combo.rangeFinal - BigInt(quantidadeCartelas - 1 - i),
      rangeTotalInicio: combo.rangeInicio,
      rangeTotalFinal: combo.rangeFinal,
    }));
  }

  private agruparBilhetesPorCombo(
    bilhetes: Array<{ numero: bigint; sequenciaBolas: number[] }>,
    combos: Array<{
      tipoCartela: TipoCartela;
      rangeInicio: bigint;
      rangeFinal: bigint;
    }>,
    tipoCartela?: TipoCartela | null,
  ) {
    const grupos = new Map<
      string,
      {
        numeroBase: bigint;
        tipoCartela: TipoCartela | null;
        bilhetes: Array<{ numero: bigint; sequenciaBolas: number[] }>;
      }
    >();

    const setores = combos.flatMap((combo) => {
      const quantidadeCartelas = obterQuantidadeCartelas(combo.tipoCartela);
      return this.expandirSetoresDoCombo(combo, quantidadeCartelas).map(
        (setor) => ({
          ...setor,
          tipoCartela: combo.tipoCartela,
        }),
      );
    });

    for (const bilhete of bilhetes) {
      const setorCorrespondente = setores.find(
        (setor) =>
          setor.rangeInicio <= bilhete.numero &&
          bilhete.numero <= setor.rangeFinal &&
          (tipoCartela ? setor.tipoCartela === tipoCartela : true),
      );
      const numeroBase = setorCorrespondente
        ? bilhete.numero -
          (setorCorrespondente.rangeInicio -
            setorCorrespondente.rangeTotalInicio)
        : bilhete.numero;
      const chave = `${tipoCartela ?? setorCorrespondente?.tipoCartela ?? 'SEM_TIPO'}:${numeroBase.toString()}`;
      const grupoExistente = grupos.get(chave);

      if (grupoExistente) {
        grupoExistente.bilhetes.push(bilhete);
        continue;
      }

      grupos.set(chave, {
        numeroBase,
        tipoCartela: tipoCartela ?? setorCorrespondente?.tipoCartela ?? null,
        bilhetes: [bilhete],
      });
    }

    return Array.from(grupos.values())
      .sort((a, b) => (a.numeroBase < b.numeroBase ? -1 : 1))
      .map((grupo, index) => ({
        ordemSequencia: index + 1,
        numeroBase: this.formatarNumeroBilhete(grupo.numeroBase),
        quantidadeCartelas: grupo.bilhetes.length,
        quantidadeBilhetes: grupo.bilhetes.length,
        bilhetes: grupo.bilhetes
          .sort((a, b) => (a.numero < b.numero ? -1 : 1))
          .map((bilhete, bilheteIndex) => ({
            ordem: bilheteIndex + 1,
            numero: this.formatarNumeroBilhete(bilhete.numero),
            sequenciaBolas: bilhete.sequenciaBolas,
          })),
      }));
  }

  private formatarNumeroBilhete(numero: bigint): string {
    return numero.toString().padStart(7, '0');
  }

  private mapearOpcoesCompraDaEdicao(
    combos: Array<{
      id: string;
      origemParticipacao: OrigemParticipacao;
      tipoCartela: TipoCartela;
      preco: Prisma.Decimal;
      rangeInicio: bigint;
      rangeFinal: bigint;
    }>,
  ): OpcaoCompraEdicao[] {
    const combosDigitais = combos.filter(
      (combo) => combo.origemParticipacao === OrigemParticipacao.DIGITAL,
    );

    return combosDigitais.map((combo) => {
      const quantidadeCartelas = obterQuantidadeCartelas(combo.tipoCartela);
      const isUnitario = combo.tipoCartela === TipoCartela.UMA_CHANCE;
      const valorCombo = this.formatarValorMonetario(combo.preco);
      const setores = this.expandirSetoresDoCombo(combo, quantidadeCartelas);
      const primeiroSetor = setores[0];

      return {
        id: combo.id,
        tipoCartela: combo.tipoCartela,
        tipoCompra: isUnitario ? 'UNITARIO' : 'COMBO',
        isCombo: !isUnitario,
        quantidadeCartelas,
        valorUnitarioCartela: valorCombo,
        valorUnitario: valorCombo,
        valorCombo: isUnitario ? null : valorCombo,
        rangeTotalInicio: primeiroSetor?.rangeTotalInicio.toString() ?? '0',
        rangeTotalFinal: primeiroSetor?.rangeTotalFinal.toString() ?? '0',
        passoEntreCartelas:
          setores[0] && setores[1]
            ? (setores[1].rangeInicio - setores[0].rangeInicio).toString()
            : '0',
        setores: setores.map((setor, index) => ({
          indiceCartela: index + 1,
          rangeInicio: setor.rangeInicio.toString(),
          rangeFinal: setor.rangeFinal.toString(),
        })),
        preco: valorCombo,
      };
    });
  }

  private normalizarTexto(valor: string): string {
    return valor.replace(/\s+/g, ' ').trim();
  }

  private normalizarCpf(cpf: string): string {
    return cpf.replace(/\D/g, '');
  }

  private normalizarTelefone(telefone: string): string {
    return telefone.replace(/\D/g, '');
  }

  private gerarFingerprintContato(
    cpf: string,
    email: string,
    mensagem: string,
  ): string {
    const base = `${cpf}|${email}|${mensagem}`;
    return createHash('sha256').update(base).digest('hex');
  }

  private async validarCooldownContato(
    cpf: string,
    email: string,
    mensagem: string,
  ): Promise<void> {
    const cooldownSeconds = LojaPublicaService.CONTATO_COOLDOWN_SEGUNDOS;

    if (cooldownSeconds <= 0) {
      return;
    }

    const fingerprint = this.gerarFingerprintContato(cpf, email, mensagem);
    const key = `contact-form:cooldown:${fingerprint}`;
    const redis = this.redisService.client;

    if (redis) {
      const wasStored = await redis.set(key, '1', 'EX', cooldownSeconds, 'NX');

      if (wasStored !== 'OK') {
        throw new HttpException(
          'Aguarde alguns instantes antes de reenviar a mesma mensagem',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return;
    }

    const limite = new Date(Date.now() - cooldownSeconds * 1000);
    const mensagemRecente = await this.prisma.contatoMensagem.findFirst({
      where: {
        fingerprint,
        createdAt: { gte: limite },
      },
      select: { id: true },
    });

    if (mensagemRecente) {
      throw new HttpException(
        'Aguarde alguns instantes antes de reenviar a mesma mensagem',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async validarLimitesContato(cpf: string): Promise<void> {
    const ip = getRequestContext()?.ip ?? 'desconhecido';
    const redis = this.redisService.client;

    if (redis) {
      await this.incrementarLimiteRedis(
        `contact-form:ip:${ip}`,
        LojaPublicaService.CONTATO_LIMITE_IP_JANELA_SEGUNDOS,
        LojaPublicaService.CONTATO_LIMITE_IP_MAXIMO,
      );
      await this.incrementarLimiteRedis(
        `contact-form:cpf:${cpf}`,
        LojaPublicaService.CONTATO_LIMITE_CPF_JANELA_SEGUNDOS,
        LojaPublicaService.CONTATO_LIMITE_CPF_MAXIMO,
      );
      return;
    }

    const limitePorIp = new Date(
      Date.now() - LojaPublicaService.CONTATO_LIMITE_IP_JANELA_SEGUNDOS * 1000,
    );
    const limitePorCpf = new Date(
      Date.now() - LojaPublicaService.CONTATO_LIMITE_CPF_JANELA_SEGUNDOS * 1000,
    );

    const [totalPorIp, totalPorCpf] = await Promise.all([
      this.prisma.contatoMensagem.count({
        where: {
          ip,
          createdAt: { gte: limitePorIp },
        },
      }),
      this.prisma.contatoMensagem.count({
        where: {
          cpf,
          createdAt: { gte: limitePorCpf },
        },
      }),
    ]);

    if (totalPorIp >= LojaPublicaService.CONTATO_LIMITE_IP_MAXIMO) {
      throw new HttpException(
        'Limite de tentativas excedido. Tente novamente mais tarde',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (totalPorCpf >= LojaPublicaService.CONTATO_LIMITE_CPF_MAXIMO) {
      throw new HttpException(
        'Limite de tentativas excedido. Tente novamente mais tarde',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async incrementarLimiteRedis(
    key: string,
    windowSeconds: number,
    limit: number,
  ): Promise<void> {
    const redis = this.redisService.client;
    if (!redis) {
      return;
    }

    const totalAtual = await redis.incr(key);
    if (totalAtual === 1) {
      await redis.expire(key, windowSeconds);
    }

    if (totalAtual > limit) {
      throw new HttpException(
        'Limite de tentativas excedido. Tente novamente mais tarde',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
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
      return this.resolverSellerPorUsuarioVendedor(usuario.id);
    }

    if (usuario?.perfil === Perfil.DISTRIBUIDOR) {
      return this.resolverSellerPorUsuarioDistribuidor(usuario.id);
    }

    const sellerPorEntidade =
      await this.resolverSellerPorEntidadeDireta(sellerId);

    if (sellerPorEntidade) {
      return sellerPorEntidade;
    }

    throw new NotFoundException('Seller não encontrado');
  }

  private async resolverSellerPorUsuarioVendedor(
    usuarioId: string,
  ): Promise<SellerOrigemResolvida> {
    const vendedor = await this.prisma.vendedor.findUnique({
      where: { usuarioId },
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

  private async resolverSellerPorUsuarioDistribuidor(
    usuarioId: string,
  ): Promise<SellerOrigemResolvida> {
    const distribuidor = await this.prisma.distribuidor.findUnique({
      where: { usuarioId },
      select: { id: true },
    });

    if (!distribuidor) {
      throw new NotFoundException('Distribuidor não encontrado');
    }

    return { vendedorId: null, distribuidorId: distribuidor.id };
  }

  private async resolverSellerPorEntidadeDireta(
    sellerId: string,
  ): Promise<EntidadeSellerIdentificada | null> {
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

    return null;
  }

  private buildRelacionamentoClienteMaisRecente(
    sellerId: string | undefined,
    sellerOrigem: SellerOrigemResolvida,
  ): AtualizacaoRelacionamentoCliente {
    if (!sellerId) {
      return {};
    }

    return {
      vendedorId: sellerOrigem.vendedorId,
      distribuidorId: sellerOrigem.distribuidorId,
    };
  }

  private isCartelaUnitaria(tipoCartela: TipoCartela): boolean {
    return tipoCartela === TipoCartela.UMA_CHANCE;
  }

  private encontrarComboDaCompra(
    combos: Array<{
      id: string;
      origemParticipacao: OrigemParticipacao;
      tipoCartela: TipoCartela;
      preco: Prisma.Decimal;
    }>,
    tipoCartela: TipoCartela,
  ) {
    return combos.find(
      (combo) =>
        combo.origemParticipacao === OrigemParticipacao.DIGITAL &&
        combo.tipoCartela === tipoCartela,
    );
  }

  private resolverTipoCartelaDaCompra(
    tipoCartela?: TipoCartela,
    quantidadeCartelas?: number,
  ): TipoCartela {
    const tipoCartelaPelaQuantidade =
      quantidadeCartelas !== undefined
        ? obterTipoCartelaPorQuantidadeCartelas(quantidadeCartelas)
        : null;

    if (quantidadeCartelas !== undefined && !tipoCartelaPelaQuantidade) {
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

    return tipoCartela ?? tipoCartelaPelaQuantidade ?? TipoCartela.UMA_CHANCE;
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
}
