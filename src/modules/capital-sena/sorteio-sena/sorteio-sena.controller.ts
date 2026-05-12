import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { SorteioSenaService } from './sorteio-sena.service';
import { InserirResultadoSenaDto } from './dto/inserir-resultado-sena.dto';

@ApiTags('Sena Admin / Sorteio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/capital-sena/sorteio')
export class SorteioSenaController {
  constructor(private readonly sorteioSenaService: SorteioSenaService) {}

  @Post(':edicaoSenaId/resultado')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Inserir resultado da Mega-Sena (ADMIN)' })
  inserirResultado(
    @Param('edicaoSenaId', ParseUUIDPipe) edicaoSenaId: string,
    @Body() dto: InserirResultadoSenaDto,
  ) {
    return this.sorteioSenaService.inserirResultado(edicaoSenaId, dto);
  }

  @Put(':edicaoSenaId/resultado')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Corrigir/atualizar resultado da Mega-Sena (ADMIN)' })
  atualizarResultado(
    @Param('edicaoSenaId', ParseUUIDPipe) edicaoSenaId: string,
    @Body() dto: InserirResultadoSenaDto,
  ) {
    return this.sorteioSenaService.inserirResultado(edicaoSenaId, dto);
  }

  @Get(':edicaoSenaId')
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({ summary: 'Consultar resultado e status do sorteio (ADMIN)' })
  consultarResultado(@Param('edicaoSenaId', ParseUUIDPipe) edicaoSenaId: string) {
    return this.sorteioSenaService.consultarResultado(edicaoSenaId);
  }
}

// ─── Rota pública ─────────────────────────────────────

@ApiTags('Sena / Loja')
@Controller('capital-sena/resultado')
export class SorteioSenaPublicoController {
  constructor(private readonly sorteioSenaService: SorteioSenaService) {}

  @Get(':edicaoSenaId')
  @ApiOperation({ summary: 'Consultar resultado público da edição Sena' })
  consultarPublico(@Param('edicaoSenaId', ParseUUIDPipe) edicaoSenaId: string) {
    return this.sorteioSenaService.consultarResultadoPublico(edicaoSenaId);
  }
}
