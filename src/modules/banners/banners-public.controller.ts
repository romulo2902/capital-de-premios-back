import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TipoBanner } from '@prisma/client';
import { BannersService } from './banners.service';

@ApiTags('Loja Pública / Banners')
@Controller('loja/banners')
export class BannersPublicController {
  constructor(private readonly bannersService: BannersService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar banners ativos para o cliente',
    description:
      'Sem filtro retorna `bannerCdp` e `bannerSena`. Com `tipo`, retorna apenas o grupo solicitado.',
  })
  @ApiQuery({ name: 'tipo', required: false, enum: TipoBanner })
  findPublicos(@Query('tipo') tipo?: string) {
    const tipoBanner = tipo
      ? this.bannersService.resolverTipoBannerParam(tipo)
      : undefined;

    return this.bannersService.findPublicos(tipoBanner);
  }

  @Get(':tipo')
  @ApiOperation({
    summary: 'Listar banners ativos por tipo (CDP ou SENA)',
  })
  findPublicosPorTipo(@Param('tipo') tipo: string) {
    return this.bannersService.findPublicos(
      this.bannersService.resolverTipoBannerParam(tipo),
    );
  }
}
