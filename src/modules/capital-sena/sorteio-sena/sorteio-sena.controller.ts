import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { SorteioSenaService } from './sorteio-sena.service';
import { InserirResultadoSenaDto } from './dto/inserir-resultado-sena.dto';
import { InserirResultadoSenaUploadDto } from './dto/inserir-resultado-sena-upload.dto';
import type { UploadFile } from '../../../common/types/upload-file.type';

@ApiTags('Sena Admin / Sorteio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/capital-sena/sorteio')
export class SorteioSenaController {
  constructor(private readonly sorteioSenaService: SorteioSenaService) {}

  @Post(':edicaoSenaId/resultado')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Inserir resultado da Mega-Sena (ADMIN)',
    description:
      'Envie via `multipart/form-data`. O campo `numerosSorteados` deve ser enviado como JSON string array. ' +
      'O campo `imagem` é opcional e deve ser a foto do resultado oficial.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: InserirResultadoSenaUploadDto })
  @UseInterceptors(FileInterceptor('imagem'))
  inserirResultado(
    @Param('edicaoSenaId', ParseUUIDPipe) edicaoSenaId: string,
    @Body() dto: InserirResultadoSenaDto,
    @UploadedFile() imagem?: UploadFile,
  ) {
    return this.sorteioSenaService.inserirResultado(edicaoSenaId, dto, imagem);
  }

  @Put(':edicaoSenaId/resultado')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Corrigir/atualizar resultado da Mega-Sena (ADMIN)',
    description: 'Mesmo comportamento do POST. Mantém a imagem anterior se nenhuma nova for enviada.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: InserirResultadoSenaUploadDto })
  @UseInterceptors(FileInterceptor('imagem'))
  atualizarResultado(
    @Param('edicaoSenaId', ParseUUIDPipe) edicaoSenaId: string,
    @Body() dto: InserirResultadoSenaDto,
    @UploadedFile() imagem?: UploadFile,
  ) {
    return this.sorteioSenaService.inserirResultado(edicaoSenaId, dto, imagem);
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
