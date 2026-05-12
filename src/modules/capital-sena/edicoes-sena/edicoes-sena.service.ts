import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FaixaPremiacao,
  Prisma,
  StatusEdicaoSena,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../../common/utils/pagination.util';
import { S3UploadService } from '../../../common/s3/s3-upload.service';
import type { UploadFile } from '../../../common/types/upload-file.type';
import { CreateEdicaoSenaDto } from './dto/create-edicao-sena.dto';
import { UpdateEdicaoSenaDto } from './dto/update-edicao-sena.dto';

const FAIXAS_VALIDAS: FaixaPremiacao[] = [
  FaixaPremiacao.QUADRA,
  FaixaPremiacao.QUINA,
  FaixaPremiacao.SENA,
  FaixaPremiacao.SENA_BONUS,
];

export interface ArquivosEdicaoSena {
  imagem?: UploadFile[];
  premioImagens?: UploadFile[];
}

@Injectable()
export class EdicoesSenaService {
  private readonly logger = new Logger(EdicoesSenaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3UploadService: S3UploadService,
  ) {}

  // ─── CREATE ────────────────────────────────────────────

  async create(dto: CreateEdicaoSenaDto, arquivos?: ArquivosEdicaoSena) {
    this.validarDatas(dto.dataEncerramento, dto.dataSorteioMegaSena);
    this.validarPremios(dto.premios);

    const existente = await this.prisma.edicaoSena.findUnique({
      where: { numero: dto.numero },
    });
    if (existente) {
      throw new ConflictException(`Edição Sena "${dto.numero}" já existe`);
    }

    // Upload imagem de capa
    const imagemUrl = await this.resolverImagemUrl(
      arquivos?.imagem?.[0],
      `capital-sena/edicoes/${dto.numero}`,
    );

    // Upload imagens dos prêmios (na mesma ordem do array dto.premios)
    const premiosComImagem = await this.resolverPremiosComImagens(
      dto.premios,
      arquivos?.premioImagens,
      `capital-sena/edicoes/${dto.numero}/premios`,
    );

    const edicao = await this.prisma.$transaction(async (tx) => {
      const created = await tx.edicaoSena.create({
        data: {
          numero: dto.numero,
          descricao: dto.descricao ?? null,
          dataSorteioMegaSena: new Date(dto.dataSorteioMegaSena),
          dataEncerramento: new Date(dto.dataEncerramento),
          valorCartela: new Prisma.Decimal(dto.valorCartela),
          imagemUrl: imagemUrl ?? null,
          premios: {
            create: premiosComImagem.map((p) => ({
              faixa: p.faixa,
              descricao: p.descricao,
              valor: new Prisma.Decimal(p.valor),
              imagemUrl: p.imagemUrl ?? null,
            })),
          },
          combos: dto.combos
            ? {
                create: dto.combos.map((c) => ({
                  nome: c.nome,
                  quantidade: c.quantidade,
                  preco: new Prisma.Decimal(c.preco),
                })),
              }
            : undefined,
        },
        include: { premios: true, combos: true, resultado: true },
      });
      return created;
    });

    this.logger.log(`EdicaoSena "${edicao.numero}" criada (id=${edicao.id})`);
    return { message: 'Edição Sena criada com sucesso', data: this.serializar(edicao) };
  }

  // ─── FIND ALL ──────────────────────────────────────────

  async findAll(page = 1, limit = 20) {
    const pagination = normalizePagination(page, limit);
    const [data, total] = await Promise.all([
      this.prisma.edicaoSena.findMany({
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: { premios: true, combos: { where: { ativo: true } }, resultado: true },
      }),
      this.prisma.edicaoSena.count(),
    ]);

    return buildPaginatedResponse(
      data.map((e) => this.serializar(e)),
      total,
      pagination.page,
      pagination.limit,
      { successMessage: 'Edições Sena listadas com sucesso', emptyMessage: 'Nenhuma edição Sena encontrada' },
    );
  }

  // ─── FIND ONE ──────────────────────────────────────────

  async findOne(id: string) {
    const edicao = await this.obterOuFalhar(id);
    return { message: 'Edição Sena encontrada', data: this.serializar(edicao) };
  }

  // ─── FIND ATIVA ────────────────────────────────────────

  async findAtiva() {
    const edicao = await this.prisma.edicaoSena.findFirst({
      where: { status: StatusEdicaoSena.ATIVA },
      orderBy: { createdAt: 'desc' },
      include: { premios: true, combos: { where: { ativo: true } }, resultado: true },
    });
    if (!edicao) throw new NotFoundException('Nenhuma edição Sena ativa');
    return { message: 'Edição Sena ativa encontrada', data: this.serializar(edicao) };
  }

  // ─── UPDATE ────────────────────────────────────────────

  async update(id: string, dto: UpdateEdicaoSenaDto, arquivos?: ArquivosEdicaoSena) {
    const atual = await this.obterOuFalhar(id);

    if (
      atual.status === StatusEdicaoSena.FINALIZADA ||
      atual.status === StatusEdicaoSena.APURANDO
    ) {
      throw new BadRequestException(`Não é possível editar uma edição com status ${atual.status}`);
    }

    if (dto.dataEncerramento || dto.dataSorteioMegaSena) {
      const enc = dto.dataEncerramento
        ? new Date(dto.dataEncerramento)
        : atual.dataEncerramento;
      const sort = dto.dataSorteioMegaSena
        ? new Date(dto.dataSorteioMegaSena)
        : atual.dataSorteioMegaSena;
      this.validarDatas(enc.toISOString(), sort.toISOString());
    }

    if (dto.premios) this.validarPremios(dto.premios);

    // Upload imagem de capa (se enviada)
    const novaImagemUrl = arquivos?.imagem?.[0]
      ? await this.resolverImagemUrl(
          arquivos.imagem[0],
          `capital-sena/edicoes/${atual.numero}`,
        )
      : undefined;

    // Upload imagens dos prêmios (se enviadas)
    const premiosComImagem = dto.premios
      ? await this.resolverPremiosComImagens(
          dto.premios,
          arquivos?.premioImagens,
          `capital-sena/edicoes/${atual.numero}/premios`,
        )
      : undefined;

    const atualizada = await this.prisma.$transaction(async (tx) => {
      await tx.edicaoSena.update({
        where: { id },
        data: {
          ...(dto.numero ? { numero: dto.numero } : {}),
          ...(dto.descricao !== undefined ? { descricao: dto.descricao } : {}),
          ...(dto.dataSorteioMegaSena
            ? { dataSorteioMegaSena: new Date(dto.dataSorteioMegaSena) }
            : {}),
          ...(dto.dataEncerramento
            ? { dataEncerramento: new Date(dto.dataEncerramento) }
            : {}),
          ...(dto.valorCartela !== undefined
            ? { valorCartela: new Prisma.Decimal(dto.valorCartela) }
            : {}),
          ...(novaImagemUrl !== undefined ? { imagemUrl: novaImagemUrl } : {}),
          ...(premiosComImagem
            ? {
                premios: {
                  deleteMany: {},
                  create: premiosComImagem.map((p) => ({
                    faixa: p.faixa,
                    descricao: p.descricao,
                    valor: new Prisma.Decimal(p.valor),
                    imagemUrl: p.imagemUrl ?? null,
                  })),
                },
              }
            : {}),
          ...(dto.combos
            ? {
                combos: {
                  deleteMany: {},
                  create: dto.combos.map((c) => ({
                    nome: c.nome,
                    quantidade: c.quantidade,
                    preco: new Prisma.Decimal(c.preco),
                  })),
                },
              }
            : {}),
        },
      });
      return tx.edicaoSena.findUnique({
        where: { id },
        include: { premios: true, combos: true, resultado: true },
      });
    });

    if (!atualizada) throw new NotFoundException('Edição Sena não encontrada após atualização');
    this.logger.log(`EdicaoSena "${atualizada.numero}" atualizada`);
    return { message: 'Edição Sena atualizada com sucesso', data: this.serializar(atualizada) };
  }

  // ─── ATIVAR / ENCERRAR ────────────────────────────────

  async ativar(id: string) {
    const edicao = await this.obterOuFalhar(id);
    if (edicao.status === StatusEdicaoSena.ATIVA) {
      return { message: 'Edição Sena já está ativa', data: this.serializar(edicao) };
    }
    if (
      edicao.status === StatusEdicaoSena.FINALIZADA ||
      edicao.status === StatusEdicaoSena.APURANDO
    ) {
      throw new BadRequestException(`Não é possível ativar uma edição com status ${edicao.status}`);
    }

    const conflito = await this.prisma.edicaoSena.findFirst({
      where: { status: StatusEdicaoSena.ATIVA, NOT: { id } },
    });
    if (conflito) {
      throw new ConflictException(
        `A edição Sena "${conflito.numero}" já está ativa. Encerre-a primeiro.`,
      );
    }

    const atualizada = await this.prisma.edicaoSena.update({
      where: { id },
      data: { status: StatusEdicaoSena.ATIVA },
      include: { premios: true, combos: { where: { ativo: true } }, resultado: true },
    });

    this.logger.log(`EdicaoSena "${atualizada.numero}" ativada`);
    return { message: 'Edição Sena ativada com sucesso', data: this.serializar(atualizada) };
  }

  async encerrar(id: string) {
    const edicao = await this.obterOuFalhar(id);
    if (edicao.status !== StatusEdicaoSena.ATIVA) {
      throw new BadRequestException('Somente edições ATIVAS podem ser encerradas');
    }
    const atualizada = await this.prisma.edicaoSena.update({
      where: { id },
      data: { status: StatusEdicaoSena.ENCERRADA },
      include: { premios: true, combos: true, resultado: true },
    });
    this.logger.log(`EdicaoSena "${atualizada.numero}" encerrada`);
    return { message: 'Edição Sena encerrada', data: this.serializar(atualizada) };
  }

  // ─── REMOVE ────────────────────────────────────────────

  async remove(id: string) {
    const edicao = await this.obterOuFalhar(id);
    if (edicao.status !== StatusEdicaoSena.RASCUNHO) {
      throw new BadRequestException('Somente edições em RASCUNHO podem ser excluídas');
    }
    await this.prisma.edicaoSena.delete({ where: { id } });
    this.logger.log(`EdicaoSena "${edicao.numero}" excluída`);
    return { message: 'Edição Sena excluída com sucesso', data: { id } };
  }

  // ─── HELPERS ──────────────────────────────────────────

  private async obterOuFalhar(id: string) {
    const edicao = await this.prisma.edicaoSena.findUnique({
      where: { id },
      include: { premios: true, combos: true, resultado: true },
    });
    if (!edicao) throw new NotFoundException('Edição Sena não encontrada');
    return edicao;
  }

  private async resolverImagemUrl(
    arquivo: UploadFile | undefined,
    folder: string,
  ): Promise<string | null> {
    if (!arquivo?.buffer || arquivo.buffer.length === 0) return null;
    try {
      return await this.s3UploadService.uploadImage(arquivo, folder);
    } catch (err) {
      this.logger.warn(
        `Falha ao enviar imagem para S3 (pasta=${folder}): ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private async resolverPremiosComImagens(
    premios: { faixa: FaixaPremiacao; descricao: string; valor: number; imagemUrl?: string }[],
    premioImagens: UploadFile[] | undefined,
    folder: string,
  ) {
    return Promise.all(
      premios.map(async (p, i) => {
        const arquivo = premioImagens?.[i];
        const imagemUrl = await this.resolverImagemUrl(arquivo, `${folder}/${p.faixa}`);
        return { ...p, imagemUrl: imagemUrl ?? p.imagemUrl ?? null };
      }),
    );
  }

  private validarDatas(dataEncerramento: string, dataSorteio: string): void {
    const enc = new Date(dataEncerramento);
    const sort = new Date(dataSorteio);
    if (isNaN(enc.getTime()) || isNaN(sort.getTime())) {
      throw new BadRequestException('Datas inválidas');
    }
    if (enc >= sort) {
      throw new BadRequestException('dataEncerramento deve ser anterior ao dataSorteioMegaSena');
    }
  }

  private validarPremios(premios: { faixa: FaixaPremiacao }[]): void {
    const faixas = premios.map((p) => p.faixa);
    const invalidas = faixas.filter((f) => !FAIXAS_VALIDAS.includes(f));
    if (invalidas.length > 0) {
      throw new BadRequestException(`Faixas inválidas: ${invalidas.join(', ')}`);
    }
    const duplicatas = faixas.filter((f, idx) => faixas.indexOf(f) !== idx);
    if (duplicatas.length > 0) {
      throw new ConflictException(`Faixas duplicadas: ${duplicatas.join(', ')}`);
    }
  }

  private serializar(edicao: {
    id: string;
    numero: string;
    descricao: string | null;
    dataSorteioMegaSena: Date;
    dataEncerramento: Date;
    valorCartela: Prisma.Decimal;
    imagemUrl: string | null;
    status: StatusEdicaoSena;
    createdAt: Date;
    updatedAt: Date;
    premios: { id: string; faixa: FaixaPremiacao; descricao: string; valor: Prisma.Decimal; imagemUrl: string | null }[];
    combos: { id: string; nome: string; quantidade: number; preco: Prisma.Decimal; ativo: boolean }[];
    resultado: { id: string; numerosSorteados: number[]; apurado: boolean; imagemResultadoUrl: string | null } | null;
  }) {
    return {
      ...edicao,
      valorCartela: edicao.valorCartela.toString(),
      premios: edicao.premios.map((p) => ({ ...p, valor: p.valor.toString() })),
      combos: edicao.combos.map((c) => ({ ...c, preco: c.preco.toString() })),
    };
  }
}
