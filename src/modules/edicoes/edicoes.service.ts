import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DestinoEdicao,
  OrigemParticipacao,
  Prisma,
  StatusEdicao,
  TipoCartela,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { S3UploadService } from '../../common/s3/s3-upload.service';
import { parseBusinessDateTime } from '../../common/utils/business-date-time.util';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';
import { CreateEdicaoDto } from './dto/create-edicao.dto';
import { CreateEdicaoComboDto } from './dto/create-edicao-combo.dto';
import { CreateEdicaoPremioDto } from './dto/create-edicao-premio.dto';
import { UpdateEdicaoDto } from './dto/update-edicao.dto';
import {
  EDICAO_INCLUDE,
  STATUSS_EDICAO_EM_OPERACAO,
} from './edicoes.constants';
import {
  obterQuantidadeCartelas as obterQuantidadeCartelasUtil,
  obterTipoCartelaPorQuantidadeCartelas as obterTipoCartelaPorQuantidadeCartelasUtil,
} from './edicoes-range.util';
import { obterTotalCombinacoesCartela as obterTotalCombinacoesCartelaUtil } from './edicoes-sequencia.util';
import { serializarEdicao as serializarEdicaoUtil } from './edicoes-serialization.util';
import type { EdicaoComRelacoes } from './edicoes.types';

interface ComboEdicaoNormalizado {
  origemParticipacao: OrigemParticipacao;
  tipoCartela: TipoCartela;
  preco: Prisma.Decimal;
  rangeInicio: bigint;
  rangeFinal: bigint;
}

interface PremioDetalhadoNormalizado {
  id?: string;
  descricao: string;
  valor: string;
  imagemUrl: string | null;
}

@Injectable()
export class EdicoesService {
  private readonly logger = new Logger(EdicoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly s3UploadService: S3UploadService,
  ) {}

  async create(dto: CreateEdicaoDto) {
    const combos = this.normalizarCombos(dto.combos);
    this.validarCombos(combos);
    const qtdNumerosCartela = await this.resolverQtdNumerosCartela(combos);
    this.validarCapacidadeCombos(combos, qtdNumerosCartela);
    const qtdPremios = dto.premios.length;
    const { rangeInicio, rangeFinal } =
      this.calcularRangesDosCombosDaEdicao(combos);

    const dataSorteio = this.parseDateTime(dto.dataSorteio, 'dataSorteio');
    const dataEncerramento = dto.dataEncerramento
      ? this.parseDateTime(dto.dataEncerramento, 'dataEncerramento')
      : dataSorteio;
    this.validarDatas(dataEncerramento, dataSorteio);
    this.validarDataEncerramentoFutura(dataEncerramento);

    const imagemUrl = await this.resolverImagemUrl(
      `edicoes/${dto.numero}`,
      dto.imagemBase64,
    );
    const premiosDetalhados = await this.resolverPremiosDetalhados(
      dto.premios,
      `edicoes/${dto.numero}/premios`,
    );

    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.edicao.create({
        data: {
          numero: dto.numero,
          dataSorteio,
          dataEncerramento,
          valorCartela: this.resolverValorCartelaLegadoEdicao(combos),
          qtdNumerosCartela,
          rangeInicio,
          rangeFinal,
          qtdPremios,
          destino: dto.destino ?? DestinoEdicao.SITE,
          raspadinha: dto.raspadinha,
          frase: dto.frase,
          imagemUrl: imagemUrl ?? null,
          manutencaoAtiva: dto.manutencaoAtiva ?? false,
          manutencaoMensagem: this.normalizarMensagemManutencao(
            dto.manutencaoMensagem,
          ),
          status: StatusEdicao.RASCUNHO,
          combos: {
            create: combos.map((combo) => ({
              origemParticipacao: combo.origemParticipacao,
              tipoCartela: combo.tipoCartela,
              preco: combo.preco,
              rangeInicio: combo.rangeInicio,
              rangeFinal: combo.rangeFinal,
            })),
          },
        },
        include: EDICAO_INCLUDE,
      });

      await this.sincronizarPremiosDetalhados(
        tx,
        created.id,
        premiosDetalhados,
      );

      return tx.edicao.findUnique({
        where: { id: created.id },
        include: EDICAO_INCLUDE,
      });
    });

    if (!item) {
      throw new NotFoundException('Edição não encontrada após a criação');
    }

    this.logger.log(
      `Edição ${item.numero} criada com ${combos.length} combo(s)`,
    );
    return {
      message: 'Edição criada com sucesso.',
      data: await this.serializarEdicaoComEstoque(item),
    };
  }

  async findAll(page = 1, limit = 20) {
    this.logger.log('Listando edições');
    const pagination = normalizePagination(page, limit);
    const [data, total, contextoTimeline] = await Promise.all([
      this.prisma.edicao.findMany({
        orderBy: { numero: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
        include: EDICAO_INCLUDE,
      }),
      this.prisma.edicao.count(),
      this.obterContextoTimelineEdicoes(),
    ]);

    const serialized = await Promise.all(
      data.map(async (item) => {
        const edicaoSerializada = await this.serializarEdicaoComEstoque(item);

        return {
          ...edicaoSerializada,
          isAtual: contextoTimeline.edicaoAtualId === item.id,
          isAnterior:
            this.isStatusEdicaoAnterior(item.status) &&
            contextoTimeline.dataSorteioAtual !== null &&
            item.dataSorteio.getTime() <
              contextoTimeline.dataSorteioAtual.getTime(),
          isProxima: contextoTimeline.edicaoProximaId === item.id,
        };
      }),
    );

    return buildPaginatedResponse(
      serialized,
      total,
      pagination.page,
      pagination.limit,
      {
        successMessage: 'Edições listadas com sucesso',
        emptyMessage: 'Nenhuma edição encontrada',
      },
    );
  }

  async findOne(id: string) {
    const item = await this.prisma.edicao.findUnique({
      where: { id },
      include: EDICAO_INCLUDE,
    });
    if (!item) throw new NotFoundException('Edição não encontrada');

    return {
      message: 'Edição encontrada com sucesso',
      data: await this.serializarEdicaoComEstoque(item),
    };
  }

  async update(id: string, dto: UpdateEdicaoDto) {
    const atual = await this.obterEdicaoOuFalhar(id);

    const combosEfetivos = dto.combos
      ? this.normalizarCombos(dto.combos)
      : this.normalizarCombosExistentes(atual);

    if (dto.combos) {
      this.validarCombos(combosEfetivos);
    }

    const qtdNumerosCartelaEfetivo = dto.combos
      ? await this.resolverQtdNumerosCartela(combosEfetivos)
      : atual.qtdNumerosCartela;

    if (dto.combos) {
      this.validarCapacidadeCombos(combosEfetivos, qtdNumerosCartelaEfetivo);
    }

    const qtdPremiosEfetivo = dto.premios
      ? dto.premios.length
      : atual.qtdPremios;

    const dataSorteio = dto.dataSorteio
      ? this.parseDateTime(dto.dataSorteio, 'dataSorteio')
      : atual.dataSorteio;
    const dataEncerramento =
      dto.dataEncerramento !== undefined
        ? this.parseDateTime(dto.dataEncerramento, 'dataEncerramento')
        : atual.dataEncerramento;
    this.validarDatas(dataEncerramento, dataSorteio);

    const resumoRanges = dto.combos
      ? this.calcularRangesDosCombosDaEdicao(combosEfetivos)
      : undefined;

    const imagemUrl = await this.resolverImagemUrl(
      `edicoes/${dto.numero ?? atual.numero}`,
      dto.imagemBase64,
    );

    const premiosDetalhados =
      dto.premios && dto.premios.length > 0
        ? await this.resolverPremiosDetalhados(
            dto.premios,
            `edicoes/${dto.numero ?? atual.numero}/premios`,
            atual.premios.map((premio) => ({
              id: premio.id,
              imagemUrl: premio.imagemUrl ?? null,
            })),
          )
        : undefined;

    const item = await this.prisma.$transaction(async (tx) => {
      const data: Prisma.EdicaoUpdateInput = {
        ...(dto.numero !== undefined ? { numero: dto.numero } : {}),
        ...(dto.dataSorteio ? { dataSorteio } : {}),
        ...(dto.dataEncerramento !== undefined ? { dataEncerramento } : {}),
        ...(dto.combos
          ? {
              valorCartela:
                this.resolverValorCartelaLegadoEdicao(combosEfetivos),
            }
          : {}),
        ...(dto.combos ? { qtdNumerosCartela: qtdNumerosCartelaEfetivo } : {}),
        ...(dto.premios ? { qtdPremios: qtdPremiosEfetivo } : {}),
        ...(dto.destino ? { destino: dto.destino } : {}),
        ...(dto.raspadinha !== undefined ? { raspadinha: dto.raspadinha } : {}),
        ...(dto.frase !== undefined ? { frase: dto.frase } : {}),
        ...(dto.manutencaoAtiva !== undefined
          ? { manutencaoAtiva: dto.manutencaoAtiva }
          : {}),
        ...(dto.manutencaoMensagem !== undefined
          ? {
              manutencaoMensagem: this.normalizarMensagemManutencao(
                dto.manutencaoMensagem,
              ),
            }
          : {}),
        ...(imagemUrl !== undefined ? { imagemUrl } : {}),
        ...(resumoRanges ?? {}),
      };

      if (dto.combos) {
        data.combos = {
          deleteMany: {},
          create: combosEfetivos.map((combo) => ({
            origemParticipacao: combo.origemParticipacao,
            tipoCartela: combo.tipoCartela,
            preco: combo.preco,
            rangeInicio: combo.rangeInicio,
            rangeFinal: combo.rangeFinal,
          })),
        };
      }

      await tx.edicao.update({ where: { id }, data });

      if (premiosDetalhados) {
        await this.sincronizarPremiosDetalhados(tx, id, premiosDetalhados);
      }

      return tx.edicao.findUnique({ where: { id }, include: EDICAO_INCLUDE });
    });

    if (!item) throw new NotFoundException('Edição não encontrada');

    this.logger.log(`Edição ${item.numero} atualizada`);
    return {
      message: 'Edição atualizada com sucesso',
      data: await this.serializarEdicaoComEstoque(item),
    };
  }

  private async resolverImagemUrl(
    folder: string,
    base64?: string,
  ): Promise<string | undefined> {
    if (base64) {
      const url = await this.s3UploadService.uploadImageFromBase64(
        base64,
        folder,
      );
      return url ?? undefined;
    }

    return undefined;
  }

  private normalizarMensagemManutencao(message?: string): string | null {
    if (message === undefined) {
      return null;
    }

    const normalizedMessage = message.trim();
    return normalizedMessage ? normalizedMessage : null;
  }

  async ativar(id: string) {
    const edicao = await this.obterEdicaoOuFalhar(id);

    if (edicao.status === StatusEdicao.ATIVA) {
      return {
        message: 'Edição já está ativada',
        data: this.serializarEdicao(edicao),
      };
    }

    if (
      edicao.status === StatusEdicao.ENCERRADA ||
      edicao.status === StatusEdicao.SORTEANDO ||
      edicao.status === StatusEdicao.FINALIZADA
    ) {
      throw new BadRequestException(
        `Não é possível ativar uma edição com status ${edicao.status}`,
      );
    }

    await this.validarEstoqueProntoParaAtivacao(edicao);
    this.validarDataEncerramentoFutura(edicao.dataEncerramento);
    await this.validarEdicaoEmOperacaoUnica(StatusEdicao.ATIVA, id);

    const atualizada = await this.prisma.edicao.update({
      where: { id },
      data: { status: StatusEdicao.ATIVA },
      include: EDICAO_INCLUDE,
    });

    this.logger.log(`Edição ${atualizada.numero} ativada`);
    return {
      message: 'Edição ativada com sucesso',
      data: await this.serializarEdicaoComEstoque(atualizada),
    };
  }

  async desativar(id: string) {
    const edicao = await this.obterEdicaoOuFalhar(id);

    if (edicao.status === StatusEdicao.RASCUNHO) {
      return {
        message: 'Edição já está desativada',
        data: this.serializarEdicao(edicao),
      };
    }

    if (
      edicao.status === StatusEdicao.ENCERRADA ||
      edicao.status === StatusEdicao.SORTEANDO ||
      edicao.status === StatusEdicao.FINALIZADA
    ) {
      throw new BadRequestException(
        `Não é possível desativar uma edição com status ${edicao.status}`,
      );
    }

    const atualizada = await this.prisma.edicao.update({
      where: { id },
      data: { status: StatusEdicao.RASCUNHO },
      include: EDICAO_INCLUDE,
    });

    this.logger.log(`Edição ${atualizada.numero} desativada`);
    return {
      message: 'Edição desativada com sucesso',
      data: await this.serializarEdicaoComEstoque(atualizada),
    };
  }

  async remove(id: string) {
    const edicao = await this.obterEdicaoOuFalhar(id);

    if (edicao.status !== StatusEdicao.RASCUNHO) {
      throw new BadRequestException(
        `Só é permitido excluir edições em RASCUNHO. Status atual: ${edicao.status}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const vendas = await tx.venda.findMany({
        where: { edicaoId: id },
        select: { id: true },
      });
      const vendaIds = vendas.map((v) => v.id);

      if (vendaIds.length > 0) {
        await tx.bilhete.deleteMany({
          where: { vendaId: { in: vendaIds } },
        });
        await tx.comissao.deleteMany({
          where: { vendaId: { in: vendaIds } },
        });
        await tx.comissaoDistribuidor.deleteMany({
          where: { vendaId: { in: vendaIds } },
        });
        await tx.venda.deleteMany({
          where: { id: { in: vendaIds } },
        });
      }

      // Segurança extra: se por algum motivo existir bilhete ligado à edição sem venda válida
      await tx.bilhete.deleteMany({ where: { edicaoId: id } });

      await tx.resultadoPremio.deleteMany({ where: { edicaoId: id } });
      await tx.resultado.deleteMany({ where: { edicaoId: id } });
      await tx.premio.deleteMany({ where: { edicaoId: id } });
      await tx.edicaoDetalhe.deleteMany({ where: { edicaoId: id } });

      await tx.edicao.delete({ where: { id } });
    });

    this.logger.log(`Edição ${edicao.numero} excluída em cascata (id=${id})`);

    return {
      message: 'Edição excluída com sucesso',
      data: { id },
    };
  }

  async findUltima() {
    this.logger.log('Buscando última edição cadastrada');

    const item = await this.prisma.edicao.findFirst({
      orderBy: { numero: 'desc' },
      include: EDICAO_INCLUDE,
    });

    if (!item) {
      throw new NotFoundException('Nenhuma edição encontrada');
    }

    return {
      message: 'Última edição encontrada com sucesso',
      data: await this.serializarEdicaoComEstoque(item),
    };
  }

  private async obterEdicaoOuFalhar(id: string): Promise<EdicaoComRelacoes> {
    const item = await this.prisma.edicao.findUnique({
      where: { id },
      include: EDICAO_INCLUDE,
    });

    if (!item) throw new NotFoundException('Edição não encontrada');
    return item;
  }

  private async validarEdicaoEmOperacaoUnica(
    status: StatusEdicao,
    ignoreId?: string,
  ): Promise<void> {
    if (!STATUSS_EDICAO_EM_OPERACAO.includes(status)) {
      return;
    }

    const conflito = await this.prisma.edicao.findFirst({
      where: {
        status: { in: STATUSS_EDICAO_EM_OPERACAO },
        ...(ignoreId ? { NOT: { id: ignoreId } } : {}),
      },
      select: {
        id: true,
        numero: true,
        status: true,
      },
    });

    if (conflito) {
      throw new ConflictException(
        `A edição ${conflito.numero} já está em operação com status ${conflito.status}`,
      );
    }
  }

  private async obterContextoTimelineEdicoes(): Promise<{
    edicaoAtualId: string | null;
    dataSorteioAtual: Date | null;
    edicaoProximaId: string | null;
  }> {
    const edicaoAtual = await this.prisma.edicao.findFirst({
      where: {
        status: StatusEdicao.ATIVA,
      },
      orderBy: { dataSorteio: 'desc' },
      select: {
        id: true,
        dataSorteio: true,
      },
    });

    if (!edicaoAtual) {
      return {
        edicaoAtualId: null,
        dataSorteioAtual: null,
        edicaoProximaId: null,
      };
    }

    const proximaEdicao = await this.prisma.edicao.findFirst({
      where: {
        dataSorteio: {
          gt: edicaoAtual.dataSorteio,
        },
      },
      orderBy: {
        dataSorteio: 'asc',
      },
      select: {
        id: true,
      },
    });

    return {
      edicaoAtualId: edicaoAtual.id,
      dataSorteioAtual: edicaoAtual.dataSorteio,
      edicaoProximaId: proximaEdicao?.id ?? null,
    };
  }

  private validarDatas(dataEncerramento: Date, dataSorteio: Date): void {
    if (
      Number.isNaN(dataEncerramento.getTime()) ||
      Number.isNaN(dataSorteio.getTime())
    ) {
      throw new BadRequestException('As datas informadas são inválidas');
    }

    if (dataEncerramento.getTime() >= dataSorteio.getTime()) {
      throw new BadRequestException(
        'dataEncerramento deve ser anterior à data do sorteio',
      );
    }
  }

  private validarDataEncerramentoFutura(dataEncerramento: Date): void {
    if (dataEncerramento.getTime() <= Date.now()) {
      throw new BadRequestException(
        'dataEncerramento deve estar no futuro para criar ou ativar a edição',
      );
    }
  }

  private isStatusEdicaoAnterior(status: StatusEdicao): boolean {
    return (
      status === StatusEdicao.ENCERRADA || status === StatusEdicao.FINALIZADA
    );
  }

  private parseDateTime(value: string, fieldLabel: string): Date {
    return parseBusinessDateTime(value, fieldLabel, this.getBusinessTimeZone())
      .date;
  }

  private getBusinessTimeZone(): string {
    return this.config.get<string>('APP_TIMEZONE', 'America/Sao_Paulo');
  }

  private async serializarEdicaoComEstoque(edicao: EdicaoComRelacoes) {
    const base = this.serializarEdicao(edicao);
    const inventario = await this.obterInventarioRanges(edicao);

    return {
      ...base,
      inventarioRanges: inventario,
    };
  }

  private async validarEstoqueProntoParaAtivacao(
    edicao: EdicaoComRelacoes,
  ): Promise<void> {
    const inventario = await this.obterInventarioRanges(edicao);

    if (!inventario.pronto) {
      throw new BadRequestException(
        `A edição ${edicao.numero} não está pronta para ativação. A matriz global não possui registros suficientes no intervalo configurado. Existentes: ${inventario.existentes}/${inventario.esperados}. Faça upload da matriz via POST /admin/ranges/matriz/upload e tente novamente.`,
      );
    }
  }

  private async obterInventarioRanges(edicao: EdicaoComRelacoes): Promise<{
    esperados: number;
    existentes: number;
    faltantes: number;
    pronto: boolean;
  }> {
    if (edicao.combos.length === 0) {
      return { esperados: 0, existentes: 0, faltantes: 0, pronto: true };
    }

    const esperados = edicao.combos.reduce(
      (total, combo) =>
        total + Number(combo.rangeFinal - combo.rangeInicio + 1n),
      0,
    );

    const existentes = await this.prisma.matrizRange.count({
      where: {
        OR: edicao.combos.map((combo) => ({
          numero: { gte: combo.rangeInicio, lte: combo.rangeFinal },
        })),
      },
    });

    const faltantes = Math.max(esperados - existentes, 0);
    return { esperados, existentes, faltantes, pronto: faltantes === 0 };
  }

  private normalizarCombos(
    combos: CreateEdicaoComboDto[],
  ): ComboEdicaoNormalizado[] {
    return combos.map((combo) => ({
      origemParticipacao: combo.origemParticipacao,
      tipoCartela: this.resolverTipoCartelaCombo(combo),
      preco: this.normalizarValorCartela(combo.preco),
      rangeInicio: BigInt(combo.rangeInicio),
      rangeFinal: BigInt(combo.rangeFinal),
    }));
  }

  private normalizarCombosExistentes(
    edicao: EdicaoComRelacoes,
  ): ComboEdicaoNormalizado[] {
    return edicao.combos.map((combo) => ({
      origemParticipacao: combo.origemParticipacao,
      tipoCartela: combo.tipoCartela,
      preco: combo.preco,
      rangeInicio: combo.rangeInicio,
      rangeFinal: combo.rangeFinal,
    }));
  }

  private resolverTipoCartelaCombo(combo: CreateEdicaoComboDto): TipoCartela {
    const tipoCartelaPelaQuantidade =
      combo.quantidadeCartelas !== undefined
        ? this.obterTipoCartelaPorQuantidadeCartelas(combo.quantidadeCartelas)
        : null;

    if (combo.quantidadeCartelas !== undefined && !tipoCartelaPelaQuantidade) {
      throw new BadRequestException(
        `quantidadeCartelas inválida no combo: ${combo.quantidadeCartelas}. Informe um valor entre 1 e 12`,
      );
    }

    if (
      combo.tipoCartela &&
      tipoCartelaPelaQuantidade &&
      combo.tipoCartela !== tipoCartelaPelaQuantidade
    ) {
      throw new BadRequestException(
        `Conflito entre tipoCartela e quantidadeCartelas (${combo.quantidadeCartelas}) no combo`,
      );
    }

    if (combo.tipoCartela) return combo.tipoCartela;
    if (tipoCartelaPelaQuantidade) return tipoCartelaPelaQuantidade;

    throw new BadRequestException('Informe quantidadeCartelas para o combo');
  }

  private validarCombos(combos: ComboEdicaoNormalizado[]): void {
    if (combos.length === 0) {
      throw new BadRequestException('Informe ao menos um combo para a edição');
    }

    const chaves = new Set<string>();
    for (const combo of combos) {
      const qtd = this.obterQuantidadeCartelas(combo.tipoCartela);
      const chave = `${combo.origemParticipacao}:${qtd}`;
      if (chaves.has(chave)) {
        throw new ConflictException(
          `Combo duplicado: ${qtd} cartela(s) para ${combo.origemParticipacao}`,
        );
      }
      chaves.add(chave);

      if (combo.rangeFinal < combo.rangeInicio) {
        throw new BadRequestException(
          `rangeFinal deve ser maior ou igual ao rangeInicio no combo de ${qtd} cartela(s)`,
        );
      }
    }

    const ordenados = [...combos].sort((a, b) =>
      a.rangeInicio < b.rangeInicio
        ? -1
        : a.rangeInicio > b.rangeInicio
          ? 1
          : 0,
    );
    for (let i = 1; i < ordenados.length; i++) {
      const prev = ordenados[i - 1];
      const curr = ordenados[i];
      if (curr.rangeInicio <= prev.rangeFinal) {
        throw new ConflictException(
          `Ranges dos combos se sobrepõem: ${prev.rangeInicio}-${prev.rangeFinal} e ${curr.rangeInicio}-${curr.rangeFinal}`,
        );
      }
    }
  }

  private calcularRangesDosCombosDaEdicao(combos: ComboEdicaoNormalizado[]): {
    rangeInicio: bigint;
    rangeFinal: bigint;
  } {
    const rangeInicio = combos.reduce(
      (min, c) => (c.rangeInicio < min ? c.rangeInicio : min),
      combos[0].rangeInicio,
    );
    const rangeFinal = combos.reduce(
      (max, c) => (c.rangeFinal > max ? c.rangeFinal : max),
      combos[0].rangeFinal,
    );
    return { rangeInicio, rangeFinal };
  }

  private async resolverQtdNumerosCartela(
    combos: ComboEdicaoNormalizado[],
  ): Promise<number> {
    let qtdNumerosCartela: number | null = null;

    for (const combo of combos) {
      const linhaMatriz = await this.prisma.matrizRange.findFirst({
        where: { numero: { gte: combo.rangeInicio, lte: combo.rangeFinal } },
        orderBy: { numero: 'asc' },
        select: { sequenciaBolas: true },
      });

      if (!linhaMatriz) {
        throw new BadRequestException(
          `A matriz precisa estar carregada para o intervalo ${combo.rangeInicio}-${combo.rangeFinal} antes de salvar. Faça o upload do XLSX/CSV e tente novamente.`,
        );
      }
      if (linhaMatriz.sequenciaBolas.length === 0) {
        throw new BadRequestException(
          `A matriz carregada para o intervalo ${combo.rangeInicio}-${combo.rangeFinal} não possui sequência de bolas válida`,
        );
      }

      qtdNumerosCartela ??= linhaMatriz.sequenciaBolas.length;
    }

    return qtdNumerosCartela as number;
  }

  private validarCapacidadeCombos(
    combos: ComboEdicaoNormalizado[],
    qtdNumerosCartela: number,
  ): void {
    const totalCartelas = combos.reduce(
      (total, combo) => total + (combo.rangeFinal - combo.rangeInicio + 1n),
      0n,
    );
    const totalCombinacoes =
      obterTotalCombinacoesCartelaUtil(qtdNumerosCartela);

    if (totalCartelas > totalCombinacoes) {
      throw new BadRequestException(
        `Os combos exigem ${totalCartelas.toString()} cartelas, mas só existem ${totalCombinacoes.toString()} combinações únicas possíveis com ${qtdNumerosCartela} números entre 1 e 50`,
      );
    }
  }

  private resolverValorCartelaLegadoEdicao(
    combos: ComboEdicaoNormalizado[],
  ): Prisma.Decimal {
    const comboUmaChance = combos.find(
      (c) => c.tipoCartela === TipoCartela.UMA_CHANCE,
    );
    if (comboUmaChance) return comboUmaChance.preco;
    if (combos.length === 0) {
      throw new BadRequestException(
        'Não foi possível definir valorCartela sem combos configurados',
      );
    }

    const comboBase = [...combos].sort((a, b) => {
      const qtdA = this.obterQuantidadeCartelas(a.tipoCartela);
      const qtdB = this.obterQuantidadeCartelas(b.tipoCartela);

      if (qtdA !== qtdB) return qtdA - qtdB;
      return a.preco.comparedTo(b.preco);
    })[0];

    return comboBase.preco
      .div(this.obterQuantidadeCartelas(comboBase.tipoCartela))
      .toDecimalPlaces(2);
  }

  private normalizarValorCartela(valorCartela: string): Prisma.Decimal {
    return new Prisma.Decimal(valorCartela.replace(',', '.'));
  }

  private normalizarValorPremio(valor: string): Prisma.Decimal {
    return new Prisma.Decimal(valor.replace(',', '.'));
  }

  private async resolverPremiosDetalhados(
    premiosPayload: CreateEdicaoPremioDto[],
    folder: string,
    premiosExistentes: Array<{ id: string; imagemUrl: string | null }> = [],
  ): Promise<PremioDetalhadoNormalizado[]> {
    const premiosNormalizados: PremioDetalhadoNormalizado[] = [];

    for (let index = 0; index < premiosPayload.length; index++) {
      const premio = premiosPayload[index];
      const ordem = index + 1;

      let imagemUrl: string | null = null;

      // 1. Prioridade: imagemBase64 direta no objeto
      if (premio.imagemBase64) {
        imagemUrl = await this.s3UploadService.uploadImageFromBase64(
          premio.imagemBase64,
          `${folder}/${ordem}`,
        );
      } else if (premio.id) {
        // Manter imagem existente se o prêmio tem ID e não enviou nova imagem
        const existente = premiosExistentes.find((p) => p.id === premio.id);
        imagemUrl = existente?.imagemUrl ?? null;
      } else {
        // Se for prêmio novo sem imagem, tenta pegar por índice do array de URLs existentes (fallback legado)
        imagemUrl = premiosExistentes[index]?.imagemUrl ?? null;
      }

      premiosNormalizados.push({
        id: premio.id,
        descricao: premio.descricao,
        valor: premio.valor,
        imagemUrl,
      });
    }

    return premiosNormalizados;
  }

  private async sincronizarPremiosDetalhados(
    tx: Prisma.TransactionClient,
    edicaoId: string,
    premiosPayload: PremioDetalhadoNormalizado[],
  ): Promise<void> {
    const premiosExistentes = await tx.premio.findMany({
      where: { edicaoId },
    });

    const idsNoPayload = premiosPayload
      .map((p) => p.id)
      .filter((id): id is string => !!id);

    // Prêmios que não estão no payload devem ser removidos
    const premiosParaRemover = premiosExistentes.filter(
      (p) => !idsNoPayload.includes(p.id),
    );

    if (premiosParaRemover.length > 0) {
      if (premiosParaRemover.some((premio) => premio.ganhadorBilheteId)) {
        throw new BadRequestException(
          'Não é possível remover prêmios que já possuem ganhadores vinculados',
        );
      }

      await tx.resultadoPremio.deleteMany({
        where: {
          premioId: {
            in: premiosParaRemover.map((p) => p.id),
          },
        },
      });

      await tx.premio.deleteMany({
        where: {
          id: {
            in: premiosParaRemover.map((p) => p.id),
          },
        },
      });
    }

    // Upsert dos prêmios do payload
    for (const [index, premioPayload] of premiosPayload.entries()) {
      const ordem = index + 1;
      const data = {
        ordem,
        descricao: premioPayload.descricao,
        valor: this.normalizarValorPremio(premioPayload.valor),
        imagemUrl: premioPayload.imagemUrl,
      };

      if (premioPayload.id) {
        await tx.premio.update({
          where: { id: premioPayload.id },
          data,
        });
      } else {
        await tx.premio.create({
          data: {
            edicaoId,
            ...data,
          },
        });
      }
    }
  }

  private serializarEdicao(edicao: EdicaoComRelacoes) {
    return serializarEdicaoUtil(edicao, this.getBusinessTimeZone());
  }

  private obterQuantidadeCartelas(tipoCartela: TipoCartela): number {
    return obterQuantidadeCartelasUtil(tipoCartela);
  }

  private obterTipoCartelaPorQuantidadeCartelas(
    quantidadeCartelas: number,
  ): TipoCartela | null {
    return obterTipoCartelaPorQuantidadeCartelasUtil(quantidadeCartelas);
  }
}
