import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BannersService } from './banners.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { FiltroBannersDto } from './dto/filtro-banners.dto';

@ApiTags('Admin / Banners')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/banners')
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  @Post()
  @ApiOperation({
    summary: 'Criar banner (ADMIN)',
    description:
      'Recebe imagem em base64 no campo `imagemBase64`, envia para o S3 e salva a URL pública.',
  })
  create(@Body() dto: CreateBannerDto) {
    return this.bannersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar banners (ADMIN)' })
  @ApiQuery({ name: 'tipo', required: false, enum: ['CDP', 'SENA'] })
  @ApiQuery({ name: 'ativo', required: false, type: Boolean })
  findAll(@Query() filtros: FiltroBannersDto) {
    return this.bannersService.findAll(filtros);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar banner por ID (ADMIN)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.bannersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar banner (ADMIN)',
    description:
      'Para trocar a imagem, envie uma nova `imagemBase64`; caso contrário, a imagem atual é mantida.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBannerDto,
  ) {
    return this.bannersService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover banner (ADMIN)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.bannersService.remove(id);
  }
}
