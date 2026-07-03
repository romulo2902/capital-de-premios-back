import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Banner, Prisma, TipoBanner } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { S3UploadService } from '../../common/s3/s3-upload.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { FiltroBannersDto } from './dto/filtro-banners.dto';

@Injectable()
export class BannersService {
  private readonly logger = new Logger(BannersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3UploadService: S3UploadService,
  ) {}

  async create(dto: CreateBannerDto) {
    const imagemUrl = await this.uploadImagem(dto.tipo, dto.imagemBase64);

    const banner = await this.prisma.banner.create({
      data: {
        tipo: dto.tipo,
        titulo: this.normalizarTextoOpcional(dto.titulo),
        descricao: this.normalizarTextoOpcional(dto.descricao),
        imagemUrl,
        linkUrl: this.normalizarTextoOpcional(dto.linkUrl),
        ordem: dto.ordem ?? 0,
        ativo: dto.ativo ?? true,
      },
    });

    this.logger.log(`Banner ${banner.id} criado para ${banner.tipo}`);

    return {
      message: 'Banner criado com sucesso',
      data: banner,
    };
  }

  async findAll(filtros: FiltroBannersDto = {}) {
    const where: Prisma.BannerWhereInput = {};

    if (filtros.tipo) {
      where.tipo = filtros.tipo;
    }

    if (filtros.ativo !== undefined) {
      where.ativo = filtros.ativo;
    }

    const banners = await this.prisma.banner.findMany({
      where,
      orderBy: [{ tipo: 'asc' }, { ordem: 'asc' }, { createdAt: 'desc' }],
    });

    return {
      message: 'Banners listados com sucesso',
      data: banners,
    };
  }

  async findOne(id: string) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });

    if (!banner) {
      throw new NotFoundException('Banner não encontrado');
    }

    return {
      message: 'Banner encontrado com sucesso',
      data: banner,
    };
  }

  async update(id: string, dto: UpdateBannerDto) {
    const atual = await this.prisma.banner.findUnique({ where: { id } });

    if (!atual) {
      throw new NotFoundException('Banner não encontrado');
    }

    const tipo = dto.tipo ?? atual.tipo;
    const data: Prisma.BannerUpdateInput = {
      ...(dto.tipo !== undefined ? { tipo: dto.tipo } : {}),
      ...(dto.titulo !== undefined
        ? { titulo: this.normalizarTextoOpcional(dto.titulo) }
        : {}),
      ...(dto.descricao !== undefined
        ? { descricao: this.normalizarTextoOpcional(dto.descricao) }
        : {}),
      ...(dto.linkUrl !== undefined
        ? { linkUrl: this.normalizarTextoOpcional(dto.linkUrl) }
        : {}),
      ...(dto.ordem !== undefined ? { ordem: dto.ordem } : {}),
      ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
    };

    if (dto.imagemBase64) {
      data.imagemUrl = await this.uploadImagem(tipo, dto.imagemBase64);
    }

    const banner = await this.prisma.banner.update({
      where: { id },
      data,
    });

    this.logger.log(`Banner ${id} atualizado`);

    return {
      message: 'Banner atualizado com sucesso',
      data: banner,
    };
  }

  async remove(id: string) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });

    if (!banner) {
      throw new NotFoundException('Banner não encontrado');
    }

    await this.prisma.banner.delete({ where: { id } });

    this.logger.log(`Banner ${id} removido`);

    return {
      message: 'Banner removido com sucesso',
    };
  }

  async findPublicos(tipo?: TipoBanner) {
    if (tipo) {
      const banners = await this.findPublicosPorTipo(tipo);

      return {
        message: 'Banners listados com sucesso',
        data: this.agruparBannersPorTipo(tipo, banners),
      };
    }

    const [bannerCdp, bannerSena] = await Promise.all([
      this.findPublicosPorTipo(TipoBanner.CDP),
      this.findPublicosPorTipo(TipoBanner.SENA),
    ]);

    return {
      message: 'Banners listados com sucesso',
      data: {
        bannerCdp,
        bannerSena,
      },
    };
  }

  resolverTipoBannerParam(tipo: string): TipoBanner {
    const tipoNormalizado = tipo.trim().toUpperCase();

    if (tipoNormalizado === TipoBanner.CDP) {
      return TipoBanner.CDP;
    }

    if (tipoNormalizado === TipoBanner.SENA) {
      return TipoBanner.SENA;
    }

    throw new BadRequestException('Tipo de banner inválido. Use CDP ou SENA');
  }

  private async findPublicosPorTipo(tipo: TipoBanner) {
    return this.prisma.banner.findMany({
      where: {
        tipo,
        ativo: true,
      },
      orderBy: [{ ordem: 'asc' }, { createdAt: 'desc' }],
    });
  }

  private agruparBannersPorTipo(
    tipo: TipoBanner,
    banners: Banner[],
  ) {
    return tipo === TipoBanner.CDP
      ? { bannerCdp: banners }
      : { bannerSena: banners };
  }

  private async uploadImagem(tipo: TipoBanner, base64: string): Promise<string> {
    const imagemUrl = await this.s3UploadService.uploadImageFromBase64(
      base64,
      `banners/${tipo.toLowerCase()}`,
    );

    if (!imagemUrl) {
      throw new BadRequestException('Imagem do banner não enviada');
    }

    return imagemUrl;
  }

  private normalizarTextoOpcional(value?: string): string | null {
    if (value === undefined) {
      return null;
    }

    const valorNormalizado = value.trim();
    return valorNormalizado ? valorNormalizado : null;
  }
}
