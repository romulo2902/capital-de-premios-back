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
  Edicao,
  EdicaoDetalhe,
  OrigemParticipacao,
  Prisma,
  StatusEdicao,
  TipoCartela,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  formatDateTimeForInput,
  parseBusinessDateTime,
} from '../../common/utils/business-date-time.util';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';
import { CreateEdicaoDto } from './dto/create-edicao.dto';
import { CreateEdicaoDetalheDto } from './dto/create-edicao-detalhe.dto';
import { UpdateEdicaoDto } from './dto/update-edicao.dto';

type EdicaoComRelacoes = Prisma.EdicaoGetPayload<{
  include: {
    detalhes: true;
    premios: true;
  };
}>;

interface DetalheRangeNormalizado {
  origemParticipacao: OrigemParticipacao;
  tipoCartela: TipoCartela;
  rangeInicio: bigint;
  rangeFinal: bigint;
}

const EDICAO_INCLUDE = {
  detalhes: {
    orderBy: [
      { origemParticipacao: 'asc' },
      { tipoCartela: 'asc' },
      { rangeInicio: 'asc' },
    ],
  },
  premios: {
    orderBy: { ordem: 'asc' },
  },
} satisfies Prisma.EdicaoInclude;

const STATUSS_EDICAO_EM_OPERACAO: StatusEdicao[] = [
  StatusEdicao.ATIVA,
  StatusEdicao.ENCERRADA,
  StatusEdicao.SORTEANDO,
];

@Injectable()
export class EdicoesService {
  private readonly logger = new Logger(EdicoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(dto: CreateEdicaoDto) {
    await this.validarNumeroEdicaoUnico(dto.numero);
    this.validarStatusDeCriacao(dto.status);

    const detalhes = this.normalizarDetalhes(dto.detalhes);
    this.validarDetalhesInternos(detalhes);
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

    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.edicao.create({
        data: {
          numero: dto.numero,
          dataSorteio,
          dataEncerramento,
          valorCartela: this.normalizarValorCartela(dto.valorCartela),
          rangeInicio,
          rangeFinal,
          qtdPremios: dto.qtdPremios,
          destino,
          raspadinha: dto.raspadinha,
          frase: dto.frase,
          imagemUrl: dto.imagemUrl,
          status,
          detalhes: {
            create: detalhes.map((detalhe) => ({
              origemParticipacao: detalhe.origemParticipacao,
              tipoCartela: detalhe.tipoCartela,
              rangeInicio: detalhe.rangeInicio,
              rangeFinal: detalhe.rangeFinal,
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

    this.logger.log(`Edição ${item.numero} criada com ${detalhes.length} detalhe(s)`);
    return {
      message: 'Edição criada com sucesso',
      data: this.serializarEdicao(item),
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

    return buildPaginatedResponse(
      data.map((item) => this.serializarEdicao(item)),
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
      data: this.serializarEdicao(item),
    };
  }

  async update(id: string, dto: UpdateEdicaoDto) {
    const atual = await this.obterEdicaoOuFalhar(id);
    this.validarStatusDeAtualizacao(dto.status, atual.status);

    if (dto.numero !== undefined) {
      await this.validarNumeroEdicaoUnico(dto.numero, id);
    }

    const detalhesEfetivos = dto.detalhes
      ? this.normalizarDetalhes(dto.detalhes)
      : this.normalizarDetalhesExistentes(atual);

    if (dto.detalhes) {
      this.validarDetalhesInternos(detalhesEfetivos);
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

    const item = await this.prisma.$transaction(async (tx) => {
      const data: Prisma.EdicaoUpdateInput = {
        ...(dto.numero !== undefined ? { numero: dto.numero } : {}),
        ...(dto.dataSorteio ? { dataSorteio } : {}),
        ...(dto.dataEncerramento !== undefined ? { dataEncerramento } : {}),
        ...(dto.valorCartela
          ? { valorCartela: this.normalizarValorCartela(dto.valorCartela) }
          : {}),
        ...(dto.qtdPremios !== undefined ? { qtdPremios: dto.qtdPremios } : {}),
        ...(dto.destino ? { destino: dto.destino } : {}),
        ...(dto.raspadinha !== undefined ? { raspadinha: dto.raspadinha } : {}),
        ...(dto.frase !== undefined ? { frase: dto.frase } : {}),
        ...(dto.imagemUrl !== undefined ? { imagemUrl: dto.imagemUrl } : {}),
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

    this.logger.log(`Edição ${item.numero} atualizada`);
    return {
      message: 'Edição atualizada com sucesso',
      data: this.serializarEdicao(item),
    };
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

    await this.validarEdicaoEmOperacaoUnica(StatusEdicao.ATIVA, id);

    const atualizada = await this.prisma.edicao.update({
      where: { id },
      data: { status: StatusEdicao.ATIVA },
      include: EDICAO_INCLUDE,
    });

    this.logger.log(`Edição ${atualizada.numero} ativada`);
    return {
      message: 'Edição ativada com sucesso',
      data: this.serializarEdicao(atualizada),
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
      data: this.serializarEdicao(atualizada),
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

  private validarStatusDeCriacao(status?: StatusEdicao): void {
    if (status && status !== StatusEdicao.RASCUNHO) {
      throw new BadRequestException(
        'Na criação de edição, apenas o status RASCUNHO é aceito. Use o endpoint de ativação para ativar a edição.',
      );
    }
  }

  private validarStatusDeAtualizacao(
    statusInformado: StatusEdicao | undefined,
    statusAtual: StatusEdicao,
  ): void {
    if (statusInformado && statusInformado !== statusAtual) {
      throw new BadRequestException(
        'O status da edição deve ser alterado pelos endpoints dedicados de ativar/desativar.',
      );
    }
  }

  private normalizarDetalhes(
    detalhes: CreateEdicaoDetalheDto[],
  ): DetalheRangeNormalizado[] {
    return detalhes.map((detalhe) => ({
      origemParticipacao: detalhe.origemParticipacao,
      tipoCartela: detalhe.tipoCartela,
      rangeInicio: BigInt(detalhe.rangeInicio),
      rangeFinal: BigInt(detalhe.rangeFinal),
    }));
  }

  private normalizarDetalhesExistentes(
    edicao: EdicaoComRelacoes,
  ): DetalheRangeNormalizado[] {
    const detalhes = this.obterDetalhesComFallback(edicao);

    return detalhes.map((detalhe) => ({
      origemParticipacao: detalhe.origemParticipacao,
      tipoCartela: detalhe.tipoCartela,
      rangeInicio: detalhe.rangeInicio,
      rangeFinal: detalhe.rangeFinal,
    }));
  }

  private validarDetalhesInternos(detalhes: DetalheRangeNormalizado[]): void {
    for (const detalhe of detalhes) {
      if (detalhe.rangeFinal < detalhe.rangeInicio) {
        throw new BadRequestException(
          'rangeFinal deve ser maior ou igual ao rangeInicio',
        );
      }
    }

    const ordenados = [...detalhes].sort((a, b) =>
      a.rangeInicio < b.rangeInicio ? -1 : 1,
    );

    for (let i = 1; i < ordenados.length; i++) {
      const anterior = ordenados[i - 1];
      const atual = ordenados[i];

      if (this.possuiSobreposicao(anterior, atual)) {
        throw new ConflictException(
          `Os detalhes da edição possuem ranges sobrepostos: ${anterior.rangeInicio.toString()}-${anterior.rangeFinal.toString()} e ${atual.rangeInicio.toString()}-${atual.rangeFinal.toString()}`,
        );
      }
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
    const possuiDigital = detalhes.some((detalhe) =>
      this.isOrigemDigital(detalhe.origemParticipacao),
    );
    const possuiFisica = detalhes.some((detalhe) =>
      this.isOrigemFisica(detalhe.origemParticipacao),
    );

    if (possuiDigital && possuiFisica && destino !== DestinoEdicao.AMBOS) {
      throw new BadRequestException(
        'Quando houver participação DIGITAL e FISICA na mesma edição, o destino deve ser AMBOS',
      );
    }

    if (possuiDigital && !possuiFisica && destino === DestinoEdicao.LOJA_FISICA) {
      throw new BadRequestException(
        'Destino LOJA_FISICA é incompatível com detalhes exclusivamente DIGITAIS',
      );
    }

    if (possuiFisica && !possuiDigital && destino === DestinoEdicao.SITE) {
      throw new BadRequestException(
        'Destino SITE é incompatível com detalhes exclusivamente FISICOS',
      );
    }
  }

  private inferirDestinoPorDetalhes(
    detalhes: DetalheRangeNormalizado[],
  ): DestinoEdicao {
    const possuiDigital = detalhes.some((detalhe) =>
      this.isOrigemDigital(detalhe.origemParticipacao),
    );
    const possuiFisica = detalhes.some((detalhe) =>
      this.isOrigemFisica(detalhe.origemParticipacao),
    );

    if (possuiDigital && possuiFisica) {
      return DestinoEdicao.AMBOS;
    }

    if (possuiFisica) {
      return DestinoEdicao.LOJA_FISICA;
    }

    return DestinoEdicao.SITE;
  }

  private isOrigemDigital(origem: OrigemParticipacao): boolean {
    return origem === OrigemParticipacao.DIGITAL;
  }

  private isOrigemFisica(origem: OrigemParticipacao): boolean {
    return (
      origem === OrigemParticipacao.FISICO ||
      origem === OrigemParticipacao.POS
    );
  }

  private validarDatas(dataEncerramento: Date, dataSorteio: Date): void {
    if (Number.isNaN(dataEncerramento.getTime()) || Number.isNaN(dataSorteio.getTime())) {
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

  private calcularResumoDosRanges(detalhes: DetalheRangeNormalizado[]): {
    rangeInicio: bigint;
    rangeFinal: bigint;
  } {
    const rangeInicio = detalhes.reduce(
      (menor, detalhe) =>
        detalhe.rangeInicio < menor ? detalhe.rangeInicio : menor,
      detalhes[0].rangeInicio,
    );

    const rangeFinal = detalhes.reduce(
      (maior, detalhe) =>
        detalhe.rangeFinal > maior ? detalhe.rangeFinal : maior,
      detalhes[0].rangeFinal,
    );

    return { rangeInicio, rangeFinal };
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
    return (
      atual.rangeInicio <= comparado.rangeFinal &&
      comparado.rangeInicio <= atual.rangeFinal
    );
  }

  private obterDetalhesComFallback(
    edicao: EdicaoComRelacoes,
  ): Array<
    EdicaoDetalhe | (DetalheRangeNormalizado & { id: string; createdAt: Date; updatedAt: Date })
  > {
    if (edicao.detalhes.length > 0) {
      return edicao.detalhes;
    }

    return [
      {
        id: `legacy-${edicao.id}`,
        origemParticipacao: OrigemParticipacao.DIGITAL,
        tipoCartela: TipoCartela.UMA_CHANCE,
        rangeInicio: edicao.rangeInicio,
        rangeFinal: edicao.rangeFinal,
        createdAt: edicao.createdAt,
        updatedAt: edicao.createdAt,
      },
    ];
  }

  private serializarEdicao(edicao: EdicaoComRelacoes) {
    const detalhes = this.obterDetalhesComFallback(edicao).map((detalhe) => ({
      ...detalhe,
      rangeInicio: detalhe.rangeInicio.toString(),
      rangeFinal: detalhe.rangeFinal.toString(),
      intervalo: (detalhe.rangeFinal - detalhe.rangeInicio + BigInt(1)).toString(),
      quantidadeChances: this.obterQuantidadeChances(detalhe.tipoCartela),
      legado: edicao.detalhes.length === 0,
    }));

    return {
      ...edicao,
      rangeInicio: edicao.rangeInicio.toString(),
      rangeFinal: edicao.rangeFinal.toString(),
      valorCartela: edicao.valorCartela.toString(),
      dataSorteioLocal: formatDateTimeForInput(
        edicao.dataSorteio,
        this.getBusinessTimeZone(),
      ),
      dataEncerramentoLocal: formatDateTimeForInput(
        edicao.dataEncerramento,
        this.getBusinessTimeZone(),
      ),
      timezone: this.getBusinessTimeZone(),
      detalhes,
      premios: edicao.premios.map((premio) => ({
        ...premio,
        valor: premio.valor.toString(),
      })),
    };
  }

  private obterQuantidadeChances(tipoCartela: TipoCartela): number {
    const mapa: Record<TipoCartela, number> = {
      [TipoCartela.UMA_CHANCE]: 1,
      [TipoCartela.DUAS_CHANCES]: 2,
      [TipoCartela.TRES_CHANCES]: 3,
      [TipoCartela.QUATRO_CHANCES]: 4,
      [TipoCartela.CINCO_CHANCES]: 5,
      [TipoCartela.SEIS_CHANCES]: 6,
      [TipoCartela.SETE_CHANCES]: 7,
      [TipoCartela.OITO_CHANCES]: 8,
      [TipoCartela.NOVE_CHANCES]: 9,
      [TipoCartela.DEZ_CHANCES]: 10,
      [TipoCartela.ONZE_CHANCES]: 11,
      [TipoCartela.DOZE_CHANCES]: 12,
    };

    return mapa[tipoCartela];
  }
}
