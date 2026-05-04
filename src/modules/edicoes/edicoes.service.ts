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
import { CreateEdicaoDetalheDto } from './dto/create-edicao-detalhe.dto';
import { CreateEdicaoPremioDto } from './dto/create-edicao-premio.dto';
import { UpdateEdicaoDto } from './dto/update-edicao.dto';
import {
  EDICAO_INCLUDE,
  STATUSS_EDICAO_EM_OPERACAO,
} from './edicoes.constants';
import { obterTotalCombinacoesCartela } from './edicoes-sequencia.util';
import {
  calcularTotalBilhetesDosDetalhes as calcularTotalBilhetesDosDetalhesUtil,
  calcularResumoDosRanges as calcularResumoDosRangesUtil,
  expandirSetoresDosDetalhes as expandirSetoresDosDetalhesUtil,
  inferirDestinoPorDetalhes as inferirDestinoPorDetalhesUtil,
  normalizarDetalhes as normalizarDetalhesUtil,
  normalizarDetalhesExistentes as normalizarDetalhesExistentesUtil,
  obterQuantidadeChances as obterQuantidadeChancesUtil,
  obterTipoCartelaPorQuantidadeChances as obterTipoCartelaPorQuantidadeChancesUtil,
  possuiSobreposicao as possuiSobreposicaoUtil,
  validarDestinoComDetalhes as validarDestinoComDetalhesUtil,
  validarDetalhesInternos as validarDetalhesInternosUtil,
} from './edicoes-range.util';
import { serializarEdicao as serializarEdicaoUtil } from './edicoes-serialization.util';
import type {
  ArquivoImagemUpload,
  DetalheRangeNormalizado,
  EdicaoComRelacoes,
} from './edicoes.types';

interface ComboEdicaoNormalizado {
  origemParticipacao: OrigemParticipacao;
  tipoCartela: TipoCartela;
  preco: Prisma.Decimal;
}

@Injectable()
export class EdicoesService {
  private readonly logger = new Logger(EdicoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly s3UploadService: S3UploadService,
  ) {}

  async create(dto: CreateEdicaoDto, imagem?: ArquivoImagemUpload) {
    const detalhes = this.normalizarDetalhes(dto.detalhes);
    const combos = this.normalizarCombos(dto.combos);
    this.validarDetalhesInternos(detalhes);
    this.validarCombosComDetalhes(combos, detalhes);
    const qtdNumerosCartela =
      await this.resolverQtdNumerosCartelaPelaMatriz(detalhes);
    this.validarCapacidadeCartelas(detalhes, qtdNumerosCartela);
    const qtdPremios = dto.premios.length;

    const status = StatusEdicao.RASCUNHO;

    const destino = dto.destino ?? this.inferirDestinoPorDetalhes(detalhes);
    this.validarDestinoComDetalhes(destino, detalhes);

    const dataSorteio = this.parseDateTime(dto.dataSorteio, 'dataSorteio');
    const dataEncerramento = dto.dataEncerramento
      ? this.parseDateTime(dto.dataEncerramento, 'dataEncerramento')
      : dataSorteio;
    this.validarDatas(dataEncerramento, dataSorteio);

    const { rangeInicio, rangeFinal } = this.calcularResumoDosRanges(detalhes);
    const imagemUrl = await this.resolverImagemUrl(
      imagem,
      `edicoes/${dto.numero}`,
    );

    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.edicao.create({
        data: {
          numero: dto.numero,
          dataSorteio,
          dataEncerramento,
          valorCartela: this.resolverValorCartelaEdicao(dto.valorCartela, combos),
          qtdNumerosCartela,
          rangeInicio,
          rangeFinal,
          qtdPremios,
          destino,
          raspadinha: dto.raspadinha,
          frase: dto.frase,
          imagemUrl: imagemUrl ?? null,
          manutencaoAtiva: dto.manutencaoAtiva ?? false,
          manutencaoMensagem: this.normalizarMensagemManutencao(
            dto.manutencaoMensagem,
          ),
          status,
          detalhes: {
            create: detalhes.map((detalhe) => ({
              origemParticipacao: detalhe.origemParticipacao,
              tipoCartela: detalhe.tipoCartela,
              indiceRange: detalhe.indiceRange,
              rangeInicio: detalhe.rangeInicio,
              rangeFinal: detalhe.rangeFinal,
              preco: null,
            })),
          },
          combos: {
            create: combos.map((combo) => ({
              origemParticipacao: combo.origemParticipacao,
              tipoCartela: combo.tipoCartela,
              preco: combo.preco,
            })),
          },
        },
        include: EDICAO_INCLUDE,
      });

      await this.sincronizarPremiosDetalhados(tx, created.id, dto.premios);

      return tx.edicao.findUnique({
        where: { id: created.id },
        include: EDICAO_INCLUDE,
      });
    });

    if (!item) {
      throw new NotFoundException('Edição não encontrada após a criação');
    }

    this.logger.log(
      `Edição ${item.numero} criada com ${detalhes.length} detalhe(s)`,
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

  async update(id: string, dto: UpdateEdicaoDto, imagem?: ArquivoImagemUpload) {
    const atual = await this.obterEdicaoOuFalhar(id);

    const detalhesEfetivos = dto.detalhes
      ? this.normalizarDetalhes(dto.detalhes)
      : this.normalizarDetalhesExistentes(atual);
    const qtdNumerosCartelaEfetivo = dto.detalhes
      ? await this.resolverQtdNumerosCartelaPelaMatriz(detalhesEfetivos)
      : atual.qtdNumerosCartela;
    const combosEfetivos = dto.combos
      ? this.normalizarCombos(dto.combos)
      : this.normalizarCombosExistentes(atual);
    const qtdPremiosEfetivo = dto.premios ? dto.premios.length : atual.qtdPremios;

    if (dto.detalhes) {
      this.validarDetalhesInternos(detalhesEfetivos);
      this.validarCapacidadeCartelas(detalhesEfetivos, qtdNumerosCartelaEfetivo);
    }

    if (dto.combos || dto.detalhes) {
      this.validarCombosComDetalhes(combosEfetivos, detalhesEfetivos);
    }

    const destinoEfetivo =
      dto.destino ??
      (dto.detalhes
        ? this.inferirDestinoPorDetalhes(detalhesEfetivos)
        : atual.destino);
    this.validarDestinoComDetalhes(destinoEfetivo, detalhesEfetivos);

    const dataSorteio = dto.dataSorteio
      ? this.parseDateTime(dto.dataSorteio, 'dataSorteio')
      : atual.dataSorteio;
    const dataEncerramento =
      dto.dataEncerramento !== undefined
        ? this.parseDateTime(dto.dataEncerramento, 'dataEncerramento')
        : atual.dataEncerramento;
    this.validarDatas(dataEncerramento, dataSorteio);

    const resumoRanges = dto.detalhes
      ? this.calcularResumoDosRanges(detalhesEfetivos)
      : undefined;
    const valorCartelaEfetivo =
      dto.valorCartela !== undefined
        ? this.normalizarValorCartela(dto.valorCartela)
        : dto.combos
          ? this.resolverValorCartelaEdicao(undefined, combosEfetivos)
          : undefined;
    const imagemUrl = await this.resolverImagemUrl(
      imagem,
      `edicoes/${dto.numero ?? atual.numero}`,
    );

    const item = await this.prisma.$transaction(async (tx) => {
      const data: Prisma.EdicaoUpdateInput = {
        ...(dto.numero !== undefined ? { numero: dto.numero } : {}),
        ...(dto.dataSorteio ? { dataSorteio } : {}),
        ...(dto.dataEncerramento !== undefined ? { dataEncerramento } : {}),
        ...(valorCartelaEfetivo !== undefined
          ? { valorCartela: valorCartelaEfetivo }
          : {}),
        ...(dto.detalhes ? { qtdNumerosCartela: qtdNumerosCartelaEfetivo } : {}),
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
        ...(resumoRanges ? resumoRanges : {}),
      };

      if (dto.detalhes) {
        data.detalhes = {
          deleteMany: {},
          create: detalhesEfetivos.map((detalhe) => ({
            origemParticipacao: detalhe.origemParticipacao,
            tipoCartela: detalhe.tipoCartela,
            indiceRange: detalhe.indiceRange,
            rangeInicio: detalhe.rangeInicio,
            rangeFinal: detalhe.rangeFinal,
            preco: null,
          })),
        };
      }

      if (dto.combos) {
        data.combos = {
          deleteMany: {},
          create: combosEfetivos.map((combo) => ({
            origemParticipacao: combo.origemParticipacao,
            tipoCartela: combo.tipoCartela,
            preco: combo.preco,
          })),
        };
      }

      await tx.edicao.update({
        where: { id },
        data,
      });

      if (dto.premios) {
        await this.sincronizarPremiosDetalhados(tx, id, dto.premios);
      }

      return tx.edicao.findUnique({
        where: { id },
        include: EDICAO_INCLUDE,
      });
    });

    if (!item) throw new NotFoundException('Edição não encontrada');

    this.logger.log(`Edição ${item.numero} atualizada`);
    return {
      message: 'Edição atualizada com sucesso',
      data: await this.serializarEdicaoComEstoque(item),
    };
  }

  private async resolverImagemUrl(
    imagem: ArquivoImagemUpload | undefined,
    folder: string,
  ): Promise<string | undefined> {
    if (!imagem) {
      return undefined;
    }

    return this.s3UploadService.uploadImage(imagem, folder);
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

  private normalizarDetalhes(
    detalhes: CreateEdicaoDetalheDto[],
  ): DetalheRangeNormalizado[] {
    return normalizarDetalhesUtil(detalhes);
  }

  private normalizarDetalhesExistentes(
    edicao: EdicaoComRelacoes,
  ): DetalheRangeNormalizado[] {
    return normalizarDetalhesExistentesUtil(edicao);
  }

  private validarDetalhesInternos(detalhes: DetalheRangeNormalizado[]): void {
    validarDetalhesInternosUtil(detalhes);
  }

  private validarCapacidadeCartelas(
    detalhes: DetalheRangeNormalizado[],
    qtdNumerosCartela: number,
  ): void {
    const totalCartelas = this.calcularTotalBilhetesDosDetalhes(detalhes);
    const totalCombinacoes = obterTotalCombinacoesCartela(qtdNumerosCartela);

    if (totalCartelas > totalCombinacoes) {
      throw new BadRequestException(
        `A edição exige ${totalCartelas.toString()} cartelas, mas só existem ${totalCombinacoes.toString()} combinações únicas possíveis com ${qtdNumerosCartela} números entre 1 e 50`,
      );
    }
  }

  private validarDestinoComDetalhes(
    destino: DestinoEdicao,
    detalhes: DetalheRangeNormalizado[],
  ): void {
    validarDestinoComDetalhesUtil(destino, detalhes);
  }

  private inferirDestinoPorDetalhes(
    detalhes: DetalheRangeNormalizado[],
  ): DestinoEdicao {
    return inferirDestinoPorDetalhesUtil(detalhes);
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
    const detalhes = this.normalizarDetalhesExistentes(edicao);

    if (detalhes.length === 0) {
      return {
        esperados: 0,
        existentes: 0,
        faltantes: 0,
        pronto: true,
      };
    }

    const esperadosBigInt = this.calcularTotalBilhetesDosDetalhes(detalhes);
    const esperados = Number(esperadosBigInt);
    const setores = this.expandirSetoresDosDetalhes(detalhes);

    // Conta quantas linhas da MatrizRange existem dentro de todos os setores
    // derivados da matriz base de cada tipo de cartela.
    const existentes = await this.prisma.matrizRange.count({
      where: {
        OR: setores.map((setor) => ({
          numero: {
            gte: setor.rangeInicio,
            lte: setor.rangeFinal,
          },
        })),
      },
    });

    const faltantes = Math.max(esperados - existentes, 0);

    return {
      esperados,
      existentes,
      faltantes,
      pronto: faltantes === 0,
    };
  }

  private calcularResumoDosRanges(detalhes: DetalheRangeNormalizado[]): {
    rangeInicio: bigint;
    rangeFinal: bigint;
  } {
    return calcularResumoDosRangesUtil(detalhes);
  }

  private expandirSetoresDosDetalhes(detalhes: DetalheRangeNormalizado[]) {
    return expandirSetoresDosDetalhesUtil(detalhes);
  }

  private calcularTotalBilhetesDosDetalhes(
    detalhes: DetalheRangeNormalizado[],
  ): bigint {
    return calcularTotalBilhetesDosDetalhesUtil(detalhes);
  }

  private normalizarCombos(
    combos: CreateEdicaoComboDto[],
  ): ComboEdicaoNormalizado[] {
    return combos.map((combo) => ({
      origemParticipacao: combo.origemParticipacao,
      tipoCartela: this.resolverTipoCartelaCombo(combo),
      preco: this.normalizarValorCartela(combo.preco),
    }));
  }

  private normalizarCombosExistentes(
    edicao: EdicaoComRelacoes,
  ): ComboEdicaoNormalizado[] {
    return edicao.combos.map((combo) => ({
      origemParticipacao: combo.origemParticipacao,
      tipoCartela: combo.tipoCartela,
      preco: combo.preco,
    }));
  }

  private resolverTipoCartelaCombo(combo: CreateEdicaoComboDto): TipoCartela {
    const tipoCartelaPelaQuantidade =
      combo.quantidadeCartelas !== undefined
        ? this.obterTipoCartelaPorQuantidadeChances(combo.quantidadeCartelas)
        : null;

    if (combo.quantidadeCartelas !== undefined && !tipoCartelaPelaQuantidade) {
      throw new BadRequestException(
        `quantidadeCartelas inválida no combo da origem ${combo.origemParticipacao}: ${combo.quantidadeCartelas}. Informe um valor entre 1 e 12`,
      );
    }

    if (
      combo.tipoCartela &&
      tipoCartelaPelaQuantidade &&
      combo.tipoCartela !== tipoCartelaPelaQuantidade
    ) {
      throw new BadRequestException(
        `Combo da origem ${combo.origemParticipacao} possui conflito entre tipoCartela (${combo.tipoCartela}) e quantidadeCartelas (${combo.quantidadeCartelas})`,
      );
    }

    if (combo.tipoCartela) {
      return combo.tipoCartela;
    }

    if (tipoCartelaPelaQuantidade) {
      return tipoCartelaPelaQuantidade;
    }

    throw new BadRequestException(
      `Informe tipoCartela ou quantidadeCartelas para o combo da origem ${combo.origemParticipacao}`,
    );
  }

  private validarCombosComDetalhes(
    combos: ComboEdicaoNormalizado[],
    detalhes: DetalheRangeNormalizado[],
  ): void {
    if (combos.length === 0) {
      throw new BadRequestException(
        'Informe ao menos um combo para a edição',
      );
    }

    const chavesCombos = new Set<string>();

    for (const combo of combos) {
      if (
        combo.origemParticipacao !== OrigemParticipacao.DIGITAL &&
        combo.origemParticipacao !== OrigemParticipacao.POS
      ) {
        throw new BadRequestException(
          `origemParticipacao em combos aceita apenas DIGITAL ou POS. Recebido: ${combo.origemParticipacao}`,
        );
      }

      const chave = `${combo.origemParticipacao}:${combo.tipoCartela}`;

      if (chavesCombos.has(chave)) {
        throw new ConflictException(
          `Combo duplicado para ${combo.origemParticipacao}/${combo.tipoCartela}`,
        );
      }

      chavesCombos.add(chave);

      const detalheDaOrigem = detalhes.find(
        (detalhe) =>
          detalhe.origemParticipacao ===
          (combo.origemParticipacao === OrigemParticipacao.POS
            ? OrigemParticipacao.FISICO
            : OrigemParticipacao.DIGITAL),
      );

      if (!detalheDaOrigem) {
        throw new BadRequestException(
          `A origem ${combo.origemParticipacao} do combo não possui ranges configurados`,
        );
      }

      const origemDetalhe =
        combo.origemParticipacao === OrigemParticipacao.POS
          ? OrigemParticipacao.FISICO
          : OrigemParticipacao.DIGITAL;
      const quantidadeRangesDaOrigem = detalhes.filter(
        (detalhe) => detalhe.origemParticipacao === origemDetalhe,
      ).length;
      const quantidadeChancesCombo = this.obterQuantidadeChances(
        combo.tipoCartela,
      );

      if (quantidadeChancesCombo > quantidadeRangesDaOrigem) {
        throw new BadRequestException(
          `O combo ${combo.tipoCartela} da origem ${combo.origemParticipacao} exige ${quantidadeChancesCombo} chances, mas essa origem possui apenas ${quantidadeRangesDaOrigem} ranges configurados`,
        );
      }
    }
  }

  private resolverValorCartelaEdicao(
    valorCartela: string | undefined,
    combos: ComboEdicaoNormalizado[],
  ): Prisma.Decimal {
    if (valorCartela !== undefined) {
      return this.normalizarValorCartela(valorCartela);
    }

    const comboUmaChanceDigital = combos.find(
      (combo) =>
        combo.origemParticipacao === OrigemParticipacao.DIGITAL &&
        combo.tipoCartela === TipoCartela.UMA_CHANCE,
    );

    if (comboUmaChanceDigital) {
      return comboUmaChanceDigital.preco;
    }

    const comboUmaChance = combos.find(
      (combo) => combo.tipoCartela === TipoCartela.UMA_CHANCE,
    );

    if (comboUmaChance) {
      return comboUmaChance.preco;
    }

    const primeiroCombo = combos[0];

    if (!primeiroCombo) {
      throw new BadRequestException(
        'Não foi possível definir valorCartela sem combos configurados',
      );
    }

    return primeiroCombo.preco;
  }

  private normalizarValorCartela(valorCartela: string): Prisma.Decimal {
    return new Prisma.Decimal(valorCartela.replace(',', '.'));
  }

  private async resolverQtdNumerosCartelaPelaMatriz(
    detalhes: DetalheRangeNormalizado[],
  ): Promise<number> {
    const setores = this.expandirSetoresDosDetalhes(detalhes);

    if (setores.length === 0) {
      throw new BadRequestException(
        'Não foi possível calcular a cartela sem setores válidos na edição',
      );
    }

    const linhaMatriz = await this.prisma.matrizRange.findFirst({
      where: {
        OR: setores.map((setor) => ({
          numero: {
            gte: setor.rangeInicio,
            lte: setor.rangeFinal,
          },
        })),
      },
      orderBy: { numero: 'asc' },
      select: {
        sequenciaBolas: true,
      },
    });

    if (!linhaMatriz) {
      throw new BadRequestException(
        'A matriz precisa estar carregada para o intervalo da edição antes de salvar. Faça o upload do XLSX/CSV e tente novamente.',
      );
    }

    if (linhaMatriz.sequenciaBolas.length === 0) {
      throw new BadRequestException(
        'A matriz carregada não possui sequência de bolas válida para a edição',
      );
    }

    return linhaMatriz.sequenciaBolas.length;
  }

  private normalizarValorPremio(valor: string): Prisma.Decimal {
    return new Prisma.Decimal(valor.replace(',', '.'));
  }

  private async sincronizarPremiosDetalhados(
    tx: Prisma.TransactionClient,
    edicaoId: string,
    premiosPayload: CreateEdicaoPremioDto[],
  ): Promise<void> {
    const premiosExistentes = await tx.premio.findMany({
      where: { edicaoId },
      orderBy: { ordem: 'asc' },
    });

    const excedentes = premiosExistentes.slice(premiosPayload.length);

    if (excedentes.length > 0) {
      if (excedentes.some((premio) => premio.ganhadorBilheteId)) {
        throw new BadRequestException(
          'Não é possível reduzir a quantidade de prêmios quando já existem ganhadores vinculados',
        );
      }

      await tx.resultadoPremio.deleteMany({
        where: {
          premioId: {
            in: excedentes.map((premio) => premio.id),
          },
        },
      });

      await tx.premio.deleteMany({
        where: {
          id: {
            in: excedentes.map((premio) => premio.id),
          },
        },
      });
    }

    for (const [index, premioPayload] of premiosPayload.entries()) {
      const ordem = index + 1;
      const data = {
        ordem,
        descricao: premioPayload.descricao,
        valor: this.normalizarValorPremio(premioPayload.valor),
      };
      const premioExistente = premiosExistentes[index];

      if (premioExistente) {
        await tx.premio.update({
          where: { id: premioExistente.id },
          data,
        });
        continue;
      }

      await tx.premio.create({
        data: {
          edicaoId,
          ...data,
        },
      });
    }
  }

  private possuiSobreposicao(
    atual: Pick<DetalheRangeNormalizado, 'rangeInicio' | 'rangeFinal'>,
    comparado: Pick<DetalheRangeNormalizado, 'rangeInicio' | 'rangeFinal'>,
  ): boolean {
    return possuiSobreposicaoUtil(atual, comparado);
  }

  private serializarEdicao(edicao: EdicaoComRelacoes) {
    return serializarEdicaoUtil(edicao, this.getBusinessTimeZone());
  }

  private obterQuantidadeChances(tipoCartela: TipoCartela): number {
    return obterQuantidadeChancesUtil(tipoCartela);
  }

  private obterTipoCartelaPorQuantidadeChances(
    quantidadeChances: number,
  ): TipoCartela | null {
    return obterTipoCartelaPorQuantidadeChancesUtil(quantidadeChances);
  }
}
