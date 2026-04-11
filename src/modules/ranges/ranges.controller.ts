import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { RangesService } from './ranges.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { FiltroRangesDto } from './dto/filtro-ranges.dto';

@ApiTags('Admin / Ranges')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/ranges')
export class RangesController {
  constructor(private readonly rangesService: RangesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar registros da matriz de ranges (ADMIN)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'edicaoId', required: false, type: String })
  @ApiQuery({ name: 'numeroInicio', required: false, type: Number })
  @ApiQuery({ name: 'numeroFim', required: false, type: Number })
  findAll(@Query() filtros: FiltroRangesDto) {
    return this.rangesService.findAll(filtros);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar registro da matriz por ID (ADMIN)' })
  findOne(@Param('id') id: string) {
    return this.rangesService.findOne(id);
  }

  @Post('matriz/upload')
  @ApiOperation({
    summary:
      'Importar/substituir a matriz global de ranges via CSV ou XLSX (ADMIN). CSV recomendado para 1 milhão+ linhas. Faz upsert — números existentes têm as bolas atualizadas.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        arquivo: {
          type: 'string',
          format: 'binary',
          description:
            'Arquivo CSV ou XLSX da matriz de ranges. CSV: numero;bolas (ex: 950000;05-07-09-21-24-31-32-35-36-39). XLSX: col A=numero, col B=bolas no mesmo formato.',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('arquivo', {
      limits: { fileSize: 250 * 1024 * 1024 }, // 250MB
    }),
  )
  importarMatriz(@UploadedFile() arquivo: Express.Multer.File) {
    return this.rangesService.importarMatriz(arquivo);
  }
}
