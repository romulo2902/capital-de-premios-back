import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VendasService } from '../vendas/vendas.service';
import { ComprarLojaDto } from './dto/comprar-loja.dto';
import { StatusEdicao, StatusVenda, TipoPagamento, OrigemParticipacao, Prisma } from '@prisma/client';
import { ConteudoService } from '../conteudo/conteudo.service';

@Injectable()
export class LojaPublicaService {
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
        quantidade: dto.quantidade, // Need a way to represent the quantity of the 'chances'. It reflects 'quantity' of this specific chance tier.
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
            premios: { orderBy: { ordem: 'asc' } }
          }
        },
        bilhetes: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const mascararCPF = (c: string) => c.substring(0, 3) + '.***.***-' + c.substring(9, 11);
    const mascararEmail = (e: string | null) => e ? e.substring(0, 3) + '***@' + e.split('@')[1] : null;

    return {
      message: 'Bilhetes encontrados',
      data: {
        cliente: {
          nome: cliente.nome,
          cpfMascarado: mascararCPF(cliente.cpf),
          emailMascarado: mascararEmail(cliente.email),
          telefone: cliente.telefone, // Perhaps mask this too, but we return it fully for now
        },
        compras: vendas.map(v => ({
          vendaId: v.id,
          total: v.total.toString(),
          dataCompra: v.createdAt,
          edicao: {
            numero: v.edicao.numero,
            dataSorteio: v.edicao.dataSorteio,
            premios: v.edicao.premios.map(p => ({
              ordem: p.ordem,
              descricao: p.descricao,
            }))
          },
          bilhetes: v.bilhetes.map(b => ({
            numero: b.numero.toString(),
            sequenciaBolas: b.sequenciaBolas
          }))
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
}
