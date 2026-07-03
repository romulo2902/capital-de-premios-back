import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ApuracaoSenaService } from './apuracao-sena.service';

@ApiTags('Sena Admin / Apuração')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/capital-sena/apuracao')
export class ApuracaoSenaController {
  constructor(private readonly apuracaoSenaService: ApuracaoSenaService) {}

  @Post(':edicaoSenaId')
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Executar apuração automática — compara cartelas com resultado da Mega-Sena e atribui QUADRA/QUINA/SENA/SENA_BONUS',
  })
  apurar(@Param('edicaoSenaId', ParseUUIDPipe) edicaoSenaId: string) {
    return this.apuracaoSenaService.apurar(edicaoSenaId);
  }

  @Get(':edicaoSenaId')
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({ summary: 'Resumo da apuração da edição Sena' })
  resumo(@Param('edicaoSenaId', ParseUUIDPipe) edicaoSenaId: string) {
    return this.apuracaoSenaService.resumo(edicaoSenaId);
  }

  @Get(':edicaoSenaId/ganhadores')
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({ summary: 'Listar cartelas ganhadoras (QUADRA ou superior)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listarGanhadores(
    @Param('edicaoSenaId', ParseUUIDPipe) edicaoSenaId: string,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.apuracaoSenaService.listarGanhadores(
      edicaoSenaId,
      pagination.page,
      pagination.limit,
    );
  }
}
