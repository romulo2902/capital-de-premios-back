import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  DestinoEdicao,
  EdicaoDetalhe,
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
import { CreateEdicaoDetalheDto } from './dto/create-edicao-detalhe.dto';
import { UpdateEdicaoDto } from './dto/update-edicao.dto';
import {
  EDICAO_INCLUDE,
  STATUSS_EDICAO_EM_OPERACAO,
} from './edicoes.constants';
import {
  EDICAO_RANGES_JOB_NAME,
  EDICOES_RANGES_QUEUE,
} from './edicoes-ranges.constants';
import { obterTotalCombinacoesCartela } from './edicoes-sequencia.util';
import {
  calcularResumoDosRanges as calcularResumoDosRangesUtil,
  inferirDestinoPorDetalhes as inferirDestinoPorDetalhesUtil,
  isOrigemDigital as isOrigemDigitalUtil,
  isOrigemFisica as isOrigemFisicaUtil,
  normalizarDetalhes as normalizarDetalhesUtil,
  normalizarDetalhesExistentes as normalizarDetalhesExistentesUtil,
  obterDetalhesComFallback as obterDetalhesComFallbackUtil,
  obterQuantidadeChances as obterQuantidadeChancesUtil,
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

@Injectable()
export class EdicoesService {
  private readonly logger = new Logger(EdicoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly s3UploadService: S3UploadService,
    @InjectQueue(EDICOES_RANGES_QUEUE)
    private readonly edicoesRangesQueue: Queue,
  ) {}

  async create(dto: CreateEdicaoDto, imagem?: ArquivoImagemUpload) {
    await this.validarNumeroEdicaoUnico(dto.numero);

    const detalhes = this.normalizarDetalhes(dto.detalhes);
    this.validarDetalhesInternos(detalhes);
    this.validarCapacidadeCartelas(detalhes, dto.qtdNumerosCartela);
    await this.validarConflitosGlobaisDeRange(detalhes);

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
          valorCartela: this.normalizarValorCartela(dto.valorCartela),
          qtdNumerosCartela: dto.qtdNumerosCartela,
          rangeInicio,
          rangeFinal,
          qtdPremios: dto.qtdPremios,
          destino,
          raspadinha: dto.raspadinha,
          frase: dto.frase,
          imagemUrl: imagemUrl ?? null,
          status,
          detalhes: {
            create: detalhes.map((detalhe) => ({
              origemParticipacao: detalhe.origemParticipacao,
              tipoCartela: detalhe.tipoCartela,
              rangeInicio: detalhe.rangeInicio,
              rangeFinal: detalhe.rangeFinal,
              preco: detalhe.preco
                ? new Prisma.Decimal(detalhe.preco.replace(',', '.'))
                : null,
            })),
          },
        },
        include: EDICAO_INCLUDE,
      });

      await this.sincronizarPremios(tx, created.id, dto.qtdPremios);

      return tx.edicao.findUnique({
        where: { id: created.id },
        include: EDICAO_INCLUDE,
      });
    });

    if (!item) {
      throw new NotFoundException('Edição não encontrada após a criação');
    }

    await this.enfileirarGeracaoRanges(item.id);

    this.logger.log(
      `Edição ${item.numero} criada com ${detalhes.length} detalhe(s)`,
    );
    return {
      message: 'Edição criada com sucesso. Geração de ranges enfileirada.',
      data: await this.serializarEdicaoComEstoque(item),
    };
  }

  async findAll(page = 1, limit = 20) {
    this.logger.log('Listando edições');
    const pagination = normalizePagination(page, limit);
    const [data, total] = await Promise.all([
      this.prisma.edicao.findMany({
        orderBy: { numero: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
        include: EDICAO_INCLUDE,
      }),
      this.prisma.edicao.count(),
    ]);

    const serialized = await Promise.all(
      data.map((item) => this.serializarEdicaoComEstoque(item)),
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

    if (dto.numero !== undefined) {
      await this.validarNumeroEdicaoUnico(dto.numero, id);
    }

    const detalhesEfetivos = dto.detalhes
      ? this.normalizarDetalhes(dto.detalhes)
      : this.normalizarDetalhesExistentes(atual);

    if (dto.detalhes) {
      this.validarDetalhesInternos(detalhesEfetivos);
      this.validarCapacidadeCartelas(
        detalhesEfetivos,
        dto.qtdNumerosCartela ?? atual.qtdNumerosCartela,
      );
      await this.validarConflitosGlobaisDeRange(detalhesEfetivos, id);
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
    const imagemUrl = await this.resolverImagemUrl(
      imagem,
      `edicoes/${dto.numero ?? atual.numero}`,
    );

    const item = await this.prisma.$transaction(async (tx) => {
      const data: Prisma.EdicaoUpdateInput = {
        ...(dto.numero !== undefined ? { numero: dto.numero } : {}),
        ...(dto.dataSorteio ? { dataSorteio } : {}),
        ...(dto.dataEncerramento !== undefined ? { dataEncerramento } : {}),
        ...(dto.valorCartela
          ? { valorCartela: this.normalizarValorCartela(dto.valorCartela) }
          : {}),
        ...(dto.qtdNumerosCartela !== undefined
          ? { qtdNumerosCartela: dto.qtdNumerosCartela }
          : {}),
        ...(dto.qtdPremios !== undefined ? { qtdPremios: dto.qtdPremios } : {}),
        ...(dto.destino ? { destino: dto.destino } : {}),
        ...(dto.raspadinha !== undefined ? { raspadinha: dto.raspadinha } : {}),
        ...(dto.frase !== undefined ? { frase: dto.frase } : {}),
        ...(imagemUrl !== undefined ? { imagemUrl } : {}),
        ...(resumoRanges ? resumoRanges : {}),
      };

      if (dto.detalhes) {
        data.detalhes = {
          deleteMany: {},
          create: detalhesEfetivos.map((detalhe) => ({
            origemParticipacao: detalhe.origemParticipacao,
            tipoCartela: detalhe.tipoCartela,
            rangeInicio: detalhe.rangeInicio,
            rangeFinal: detalhe.rangeFinal,
            preco: detalhe.preco
              ? new Prisma.Decimal(detalhe.preco.replace(',', '.'))
              : null,
          })),
        };
      }

      await tx.edicao.update({
        where: { id },
        data,
      });

      if (dto.qtdPremios !== undefined) {
        await this.sincronizarPremios(tx, id, dto.qtdPremios);
      }

      return tx.edicao.findUnique({
        where: { id },
        include: EDICAO_INCLUDE,
      });
    });

    if (!item) throw new NotFoundException('Edição não encontrada');

    if (dto.detalhes) {
      await this.enfileirarGeracaoRanges(item.id);
    }

    this.logger.log(`Edição ${item.numero} atualizada`);
    return {
      message: dto.detalhes
        ? 'Edição atualizada com sucesso. Geração de ranges enfileirada.'
        : 'Edição atualizada com sucesso',
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

  async gerarRanges(id: string) {
    const edicao = await this.obterEdicaoOuFalhar(id);
    await this.enfileirarGeracaoRanges(id, true);

    return {
      message: 'Geração de ranges enfileirada com sucesso',
      data: await this.serializarEdicaoComEstoque(edicao),
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

  private async validarNumeroEdicaoUnico(
    numero: number,
    ignoreId?: string,
  ): Promise<void> {
    const conflict = await this.prisma.edicao.findFirst({
      where: {
        numero,
        ...(ignoreId ? { NOT: { id: ignoreId } } : {}),
      },
      select: { id: true },
    });

    if (conflict) {
      throw new ConflictException('Já existe uma edição com esse número');
    }
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
    const totalCartelas = detalhes.reduce(
      (total, detalhe) =>
        total + (detalhe.rangeFinal - detalhe.rangeInicio + BigInt(1)),
      0n,
    );
    const totalCombinacoes = obterTotalCombinacoesCartela(qtdNumerosCartela);

    if (totalCartelas > totalCombinacoes) {
      throw new BadRequestException(
        `A edição exige ${totalCartelas.toString()} cartelas, mas só existem ${totalCombinacoes.toString()} combinações únicas possíveis com ${qtdNumerosCartela} números entre 1 e 50`,
      );
    }
  }

  private async validarConflitosGlobaisDeRange(
    detalhes: DetalheRangeNormalizado[],
    ignoreEdicaoId?: string,
  ): Promise<void> {
    const existentes = await this.prisma.edicaoDetalhe.findMany({
      where: ignoreEdicaoId ? { NOT: { edicaoId: ignoreEdicaoId } } : {},
      select: {
        rangeInicio: true,
        rangeFinal: true,
        edicaoId: true,
        origemParticipacao: true,
        tipoCartela: true,
        edicao: {
          select: { numero: true },
        },
      },
    });

    for (const detalhe of detalhes) {
      const conflito = existentes.find((existente) =>
        this.possuiSobreposicao(detalhe, existente),
      );

      if (conflito) {
        throw new ConflictException(
          `O range ${detalhe.rangeInicio.toString()}-${detalhe.rangeFinal.toString()} conflita com a edição ${conflito.edicao.numero}`,
        );
      }
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

  private isOrigemDigital(origem: OrigemParticipacao): boolean {
    return isOrigemDigitalUtil(origem);
  }

  private isOrigemFisica(origem: OrigemParticipacao): boolean {
    return isOrigemFisicaUtil(origem);
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
      await this.enfileirarGeracaoRanges(edicao.id);

      throw new BadRequestException(
        `A edição ${edicao.numero} ainda não está pronta para ativação. Estoque atual: ${inventario.existentes}/${inventario.esperados} ranges. Aguarde a geração terminar e tente novamente.`,
      );
    }
  }

  private async obterInventarioRanges(edicao: EdicaoComRelacoes): Promise<{
    esperados: number;
    existentes: number;
    faltantes: number;
    pronto: boolean;
    geracaoEmAndamento: boolean;
  }> {
    const detalhes = this.normalizarDetalhesExistentes(edicao);
    const esperadosBigInt = detalhes.reduce(
      (total, detalhe) =>
        total + (detalhe.rangeFinal - detalhe.rangeInicio + BigInt(1)),
      BigInt(0),
    );
    const esperados = Number(esperadosBigInt);

    if (detalhes.length === 0) {
      return {
        esperados: 0,
        existentes: 0,
        faltantes: 0,
        pronto: true,
        geracaoEmAndamento: false,
      };
    }

    const existentes = await this.prisma.range.count({
      where: {
        OR: detalhes.map((detalhe) => ({
          numero: {
            gte: detalhe.rangeInicio,
            lte: detalhe.rangeFinal,
          },
        })),
      },
    });

    const geracaoEmAndamento = await this.isGeracaoRangesEmAndamento(edicao.id);
    const faltantes = Math.max(esperados - existentes, 0);

    return {
      esperados,
      existentes,
      faltantes,
      pronto: faltantes === 0,
      geracaoEmAndamento,
    };
  }

  private async enfileirarGeracaoRanges(
    edicaoId: string,
    force = false,
  ): Promise<void> {
    const jobId = this.getGeracaoRangesJobId(edicaoId);

    if (!force) {
      const emAndamento = await this.isGeracaoRangesEmAndamento(edicaoId);
      if (emAndamento) {
        return;
      }
    }

    try {
      await this.edicoesRangesQueue.add(
        EDICAO_RANGES_JOB_NAME,
        { edicaoId },
        {
          jobId,
          removeOnComplete: 10,
          removeOnFail: 20,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      );
      this.logger.log(`Geração de ranges enfileirada para edição ${edicaoId}`);
    } catch (error) {
      this.logger.warn(
        `Não foi possível enfileirar a geração de ranges da edição ${edicaoId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async isGeracaoRangesEmAndamento(edicaoId: string): Promise<boolean> {
    const job = await this.edicoesRangesQueue.getJob(
      this.getGeracaoRangesJobId(edicaoId),
    );

    if (!job) {
      return false;
    }

    const state = await job.getState();
    return ['waiting', 'active', 'delayed', 'prioritized'].includes(state);
  }

  private getGeracaoRangesJobId(edicaoId: string): string {
    return `edicao:${edicaoId}:ranges`;
  }

  private calcularResumoDosRanges(detalhes: DetalheRangeNormalizado[]): {
    rangeInicio: bigint;
    rangeFinal: bigint;
  } {
    return calcularResumoDosRangesUtil(detalhes);
  }

  private normalizarValorCartela(valorCartela: string): Prisma.Decimal {
    return new Prisma.Decimal(valorCartela.replace(',', '.'));
  }

  private async sincronizarPremios(
    tx: Prisma.TransactionClient,
    edicaoId: string,
    qtdPremios: number,
  ): Promise<void> {
    const premios = await tx.premio.findMany({
      where: { edicaoId },
      orderBy: { ordem: 'asc' },
    });

    if (premios.length < qtdPremios) {
      const createData: Prisma.PremioCreateManyInput[] = [];

      for (let ordem = premios.length + 1; ordem <= qtdPremios; ordem++) {
        createData.push({
          edicaoId,
          ordem,
          descricao: `${ordem}º Prêmio`,
          valor: new Prisma.Decimal(0),
        });
      }

      if (createData.length > 0) {
        await tx.premio.createMany({ data: createData });
      }

      return;
    }

    if (premios.length > qtdPremios) {
      const excedentes = premios.filter((premio) => premio.ordem > qtdPremios);

      if (excedentes.some((premio) => premio.ganhadorBilheteId)) {
        throw new BadRequestException(
          'Não é possível reduzir a quantidade de prêmios quando já existem ganhadores vinculados',
        );
      }

      await tx.premio.deleteMany({
        where: {
          id: {
            in: excedentes.map((premio) => premio.id),
          },
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

  private obterDetalhesComFallback(edicao: EdicaoComRelacoes): Array<
    | EdicaoDetalhe
    | (DetalheRangeNormalizado & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
      })
  > {
    return obterDetalhesComFallbackUtil(edicao);
  }

  private serializarEdicao(edicao: EdicaoComRelacoes) {
    return serializarEdicaoUtil(edicao, this.getBusinessTimeZone());
  }

  private obterQuantidadeChances(tipoCartela: TipoCartela): number {
    return obterQuantidadeChancesUtil(tipoCartela);
  }
}
