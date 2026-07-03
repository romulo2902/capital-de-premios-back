import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { SorteioService } from './sorteio.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MarcarNumeroDto } from './dto/marcar-numero.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@ApiTags('Admin / Sorteio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/sorteio')
export class SorteioController {
  constructor(private readonly sorteioService: SorteioService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Listar sorteios (ADMIN)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(@Query() pagination: PaginationQueryDto) {
    return this.sorteioService.findAll(pagination.page, pagination.limit);
  }

  @Get(':edicaoId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Buscar sorteio por edição (ADMIN)' })
  @ApiParam({ name: 'edicaoId', description: 'ID da edição (UUID)' })
  findOne(@Param('edicaoId') edicaoId: string) {
    return this.sorteioService.findOne(edicaoId);
  }

  @Get(':edicaoId/estado')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Obter estado atual do sorteio em tempo real (ADMIN)',
    description:
      'Consulta o estado atual da apuração da edição, incluindo status, prêmios e números já marcados.',
  })
  @ApiParam({ name: 'edicaoId', description: 'ID da edição (UUID)' })
  obterEstado(@Param('edicaoId') edicaoId: string) {
    return this.sorteioService.obterEstadoSorteio(edicaoId);
  }

  @Post(':edicaoId/iniciar')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Iniciar apuração do sorteio (ADMIN apenas)',
    description:
      'Inicia o sorteio da edição. A edição precisa estar com status ENCERRADA. Ao iniciar, o status muda para SORTEANDO e a estrutura de resultado dos prêmios é preparada.',
  })
  @ApiParam({ name: 'edicaoId', description: 'ID da edição (UUID)' })
  iniciarSorteio(@Param('edicaoId') edicaoId: string) {
    return this.sorteioService.iniciarSorteio(edicaoId);
  }

  @Post(':edicaoId/premio/:premioId/marcar')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Marcar número sorteado em um prêmio (ADMIN apenas)',
    description:
      'Marca um número no prêmio informado. A edição precisa já estar em SORTEANDO.',
  })
  @ApiParam({ name: 'edicaoId', description: 'ID da edição (UUID)' })
  @ApiParam({ name: 'premioId', description: 'ID do prêmio (UUID)' })
  marcarNumero(
    @Param('edicaoId') edicaoId: string,
    @Param('premioId') premioId: string,
    @Body() dto: MarcarNumeroDto,
  ) {
    return this.sorteioService.marcarNumero(edicaoId, premioId, dto.numero);
  }

  @Post(':edicaoId/premio/:premioId/desmarcar')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Desmarcar número de um prêmio (ADMIN apenas)',
    description:
      'Remove um número previamente marcado no prêmio informado. A edição precisa estar em SORTEANDO.',
  })
  @ApiParam({ name: 'edicaoId', description: 'ID da edição (UUID)' })
  @ApiParam({ name: 'premioId', description: 'ID do prêmio (UUID)' })
  desmarcarNumero(
    @Param('edicaoId') edicaoId: string,
    @Param('premioId') premioId: string,
    @Body() dto: MarcarNumeroDto,
  ) {
    return this.sorteioService.desmarcarNumero(edicaoId, premioId, dto.numero);
  }

  @Post(':edicaoId/finalizar')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Finalizar sorteio da edição (ADMIN apenas)',
    description:
      'Finaliza a apuração do sorteio e altera o status da edição para FINALIZADA.',
  })
  @ApiParam({ name: 'edicaoId', description: 'ID da edição (UUID)' })
  finalizarSorteio(@Param('edicaoId') edicaoId: string) {
    return this.sorteioService.finalizarSorteio(edicaoId);
  }
}
