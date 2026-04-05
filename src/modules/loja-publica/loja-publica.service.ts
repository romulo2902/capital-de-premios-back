import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VendasService } from '../vendas/vendas.service';
import { ComprarLojaDto } from './dto/comprar-loja.dto';
import {
  StatusEdicao,
  StatusVenda,
  TipoPagamento,
  OrigemParticipacao,
  Prisma,
  TipoCartela,
} from '@prisma/client';
import { ConteudoService } from '../conteudo/conteudo.service';
import { obterQuantidadeChances } from '../edicoes/edicoes-range.util';

@Injectable()
export class LojaPublicaService {
  private readonly logger = new Logger(LojaPublicaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vendasService: VendasService,
    private readonly conteudoService: ConteudoService,
  ) {}

  async getHome() {
    const edicaoAtiva = await this.prisma.edicao.findFirst({
      where: { status: StatusEdicao.ATIVA },
      include: {
        premios: { orderBy: { ordem: 'asc' } },
        detalhes: {
          where: { origemParticipacao: OrigemParticipacao.DIGITAL },
          orderBy: { tipoCartela: 'asc' }
        }
      }
    });

    if (!edicaoAtiva) {
      return { message: 'Nenhuma edição ativa no momento', data: null };
    }

    const opcoesDeCompra = edicaoAtiva.detalhes.map(detalhe => {
      const preco = (detalhe as any).preco ? (detalhe as any).preco : edicaoAtiva.valorCartela;
      return {
        tipoCartela: detalhe.tipoCartela,
        preco: preco.toString(),
      };
    });

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
          valorCartela: edicaoAtiva.valorCartela.toString(),
          qtdNumerosCartela: edicaoAtiva.qtdNumerosCartela,
        },
        premios: edicaoAtiva.premios.map(p => ({
          ordem: p.ordem,
          descricao: p.descricao,
          valor: p.valor.toString(),
        })),
        opcoes: opcoesDeCompra,
        countdown: {
          dataSorteio: edicaoAtiva.dataSorteio,
          serverTime: new Date(),
        }
      }
    };
  }

  async getEdicaoAtiva() {
    return this.getHome(); // Serve the same data since home essentially focuses on the active edition
  }

  async comprar(dto: ComprarLojaDto) {
    const edicao = await this.prisma.edicao.findUnique({
      where: { id: dto.edicaoId },
      include: {
        detalhes: {
          where: { 
            origemParticipacao: OrigemParticipacao.DIGITAL,
            tipoCartela: dto.tipoCartela
          }
        }
      }
    });

    if (!edicao) throw new NotFoundException('Edição não encontrada');
    if (edicao.status !== StatusEdicao.ATIVA) throw new BadRequestException('Edição não está ativa');

    const detalheSelecionado = edicao.detalhes[0];
    if (!detalheSelecionado) {
      throw new BadRequestException('Tipo de cartela não está disponível para esta edição');
    }

    const quantidadeCartelas = obterQuantidadeChances(dto.tipoCartela) * dto.quantidade;

    // Calcula total
    const precoUnitario = (detalheSelecionado as any).preco ? Number((detalheSelecionado as any).preco) : Number(edicao.valorCartela);
    const total = precoUnitario * dto.quantidade;

    // Use the existing VendasService to generate logic, but we modify how the service handles the price, 
    // or we create the venda manual here and call the gateway
    // Assuming VendasService calculates `total` internally, it might be safer to create the sale directly here 
    // to override the price logic if `vendasService.create` doesn't support custom pricing yet.

    const cpfLimpo = dto.cpf.replace(/\D/g, '');
    let cliente = await this.prisma.cliente.findUnique({ where: { cpf: cpfLimpo } });
    if (!cliente) {
      const dbDate = dto.dataNascimento ? new Date(dto.dataNascimento) : null;
      cliente = await this.prisma.cliente.create({
        data: {
          cpf: cpfLimpo,
          nome: dto.nome,
          telefone: dto.telefone,
          email: dto.email,
          dataNascimento: dbDate && !isNaN(dbDate.getTime()) ? dbDate : null,
        }
      });
    }

    // Since VendasService calculates price rigidly by valorCartela * quantidade,
    // We will mimic the create method but specify the calculated total directly
    // Assuming VendasService logic needs an update, I will update VendasService manually or mimic it here.
    // For now, let's call the `VendasService`, but wait... I need to update VendasService to accept 'total' or 'tipoCartela'.
    
    // Creating it manually as VendasService might be overriden later, or we use a separate method in VendasService.
    // For simplicity, let's just create it here:
    
    const venda = await this.prisma.venda.create({
      data: {
        edicaoId: edicao.id,
        clienteId: cliente.id,
        quantidade: quantidadeCartelas,
        tipoCartela: dto.tipoCartela,
        total: new Prisma.Decimal(total.toFixed(2)),
        status: StatusVenda.PENDENTE,
        origemParticipacao: OrigemParticipacao.DIGITAL,
        tipoPagamento: TipoPagamento.PIX,
      }
    });

    // Create PIX charge
    let dadosPagamento = {};
    const paymentGatewayFactory = (this.vendasService as any).paymentGatewayFactory; // Accessing internal for now, should ideally be public or injected
    if (paymentGatewayFactory) {
      try {
        const gateway = paymentGatewayFactory.getGateway(TipoPagamento.PIX);
        const cobranca = await gateway.criarCobranca({
          vendaId: venda.id,
          valorCentavos: Math.round(total * 100),
          descricao: `Capital de Prêmios - Edição ${edicao.numero} - ${dto.quantidade}x ${dto.tipoCartela}`,
          cpfPagador: cpfLimpo,
          nomePagador: dto.nome,
          expiracaoSegundos: 3600 // 1 hour
        });

        await this.prisma.venda.update({
          where: { id: venda.id },
          data: {
            gatewayId: cobranca.gatewayId,
            gatewayPayload: cobranca.payload as any,
          }
        });
        dadosPagamento = {
          pixCopiaECola: cobranca.pixCopiaECola,
          qrCodeBase64: cobranca.qrCodeBase64,
          urlPagamento: cobranca.urlPagamento,
        }
      } catch (e) {
        console.error("Gateway error:", e);
      }
    }

    return {
      message: 'Pedido criado com sucesso',
      data: {
        vendaId: venda.id,
        total: venda.total.toString(),
        quantidadeCartelas,
        pagamento: dadosPagamento
      }
    };
  }

  async consultarNumeros(cpf: string) {
    const cpfLimpo = cpf.replace(/\D/g, '');
    const cliente = await this.prisma.cliente.findUnique({ where: { cpf: cpfLimpo } });

    if (!cliente) throw new NotFoundException('Nenhum cadastro encontrado para este CPF');

    const vendas = await this.prisma.venda.findMany({
      where: {
        clienteId: cliente.id,
        status: StatusVenda.APROVADO
      },
      include: {
        edicao: {
          include: {
            premios: { orderBy: { ordem: 'asc' } },
            detalhes: {
              where: { origemParticipacao: OrigemParticipacao.DIGITAL },
              orderBy: { tipoCartela: 'asc' },
            },
          }
        },
        bilhetes: {
          orderBy: { numero: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' }
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
        compras: vendas.map(v => ({
          vendaId: v.id,
          numeroPedido: v.id,
          status: v.status,
          statusLabel: this.mapearStatusVenda(v.status),
          tipoPagamento: v.tipoPagamento,
          tipoPagamentoLabel: this.mapearTipoPagamento(v.tipoPagamento),
          quantidade: v.quantidade,
          quantidadeBilhetes: v.bilhetes.length,
          tipoCartela: v.tipoCartela,
          quantidadeChances: v.tipoCartela
            ? obterQuantidadeChances(v.tipoCartela)
            : v.quantidade,
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
            dataEncerramentoFormatada: this.formatarDataHora(v.edicao.dataEncerramento),
            imagemUrl: v.edicao.imagemUrl,
            frase: v.edicao.frase,
            valorCartela: v.edicao.valorCartela.toString(),
            valorCartelaFormatado: this.formatarMoeda(v.edicao.valorCartela),
            qtdNumerosCartela: v.edicao.qtdNumerosCartela,
            opcoesCompra: v.edicao.detalhes.map((detalhe) => ({
              tipoCartela: detalhe.tipoCartela,
              quantidadeCartelas: obterQuantidadeChances(detalhe.tipoCartela),
              preco: (detalhe.preco ?? v.edicao.valorCartela).toString(),
              precoFormatado: this.formatarMoeda(
                detalhe.preco ?? v.edicao.valorCartela,
              ),
            })),
            premios: v.edicao.premios.map(p => ({
              ordem: p.ordem,
              descricao: p.descricao,
              valor: p.valor.toString(),
              valorFormatado: this.formatarMoeda(p.valor),
            }))
          },
          resumo: {
            titulo: `EDIÇÃO ${String(v.edicao.numero).padStart(2, '0')} | ${this.formatarData(v.edicao.dataSorteio)}`,
            subtitulo: `${v.bilhetes.length} cartela(s) com ${v.edicao.qtdNumerosCartela} número(s) cada`,
          },
          bilhetes: v.bilhetes.map(b => ({
            numero: b.numero.toString(),
            sequenciaBolas: b.sequenciaBolas,
          })),
        }))
      }
    };
  }

  async getResultados() {
    const edicoes = await this.prisma.edicao.findMany({
      where: { status: StatusEdicao.FINALIZADA },
      include: { resultado: true, premios: { include: { edicao: false } } }, // Add logic to fetch winners
      orderBy: { dataSorteio: 'desc' },
      take: 10
    });

    return {
      message: 'Resultados carregados',
      data: edicoes.map(e => ({
        id: e.id,
        numero: e.numero,
        dataSorteio: e.dataSorteio,
        resultado: e.resultado ? e.resultado.numerosApurados : null,
      }))
    }
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
    };

    return labels[tipoPagamento];
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
}
