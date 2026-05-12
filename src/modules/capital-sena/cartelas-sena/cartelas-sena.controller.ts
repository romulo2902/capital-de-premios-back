import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../auth/strategies/jwt.strategy';
import { CartelasSenaService } from './cartelas-sena.service';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

@ApiTags('Sena / Loja')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('capital-sena/minhas-cartelas')
export class CartelasSenaController {
  constructor(private readonly cartelasSenaService: CartelasSenaService) {}

  @Get()
  @Roles('CLIENTE', 'ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({ summary: 'Listar cartelas do cliente logado' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'edicaoSenaId', required: false })
  minhasCartelas(
    @CurrentUser() user: RequestUser,
    @Query() pagination: PaginationQueryDto,
    @Query('edicaoSenaId') edicaoSenaId?: string,
  ) {
    if (!user.cpf) {
      return { message: 'Nenhuma cartela encontrada', data: [] };
    }
    return this.cartelasSenaService.listarCartelasCliente(
      user.cpf,
      pagination.page,
      pagination.limit,
      edicaoSenaId,
    );
  }

  @Get(':id')
  @Roles('CLIENTE', 'ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({ summary: 'Detalhar cartela Sena do cliente' })
  detalharCartela(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.cartelasSenaService.detalharCartela(id, user.cpf ?? '');
  }
}

@ApiTags('Sena Admin / Cartelas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/capital-sena/cartelas')
export class CartelasSenaAdminController {
  constructor(private readonly cartelasSenaService: CartelasSenaService) {}

  @Get()
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({ summary: 'Listar todas as cartelas Sena de uma edição (ADMIN)' })
  @ApiQuery({ name: 'edicaoSenaId', required: true })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listarPorEdicao(
    @Query('edicaoSenaId') edicaoSenaId: string,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.cartelasSenaService.listarPorEdicao(
      edicaoSenaId,
      pagination.page,
      pagination.limit,
    );
  }

  @Get(':id')
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({ summary: 'Detalhar cartela Sena por ID (ADMIN)' })
  detalharAdmin(@Param('id', ParseUUIDPipe) id: string) {
    return this.cartelasSenaService.detalharCartela(id);
  }
}
