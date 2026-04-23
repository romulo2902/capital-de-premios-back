import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { LojaPublicaService } from './loja-publica.service';
import { ComprarLojaDto } from './dto/comprar-loja.dto';
import { ListarCombosLojaDto } from './dto/listar-combos-loja.dto';
import { OrigemParticipacao, TipoCartela } from '@prisma/client';
import { CreateFaleConoscoDto } from './dto/create-fale-conosco.dto';

@ApiTags('Loja Pública')
@Controller('loja')
export class LojaPublicaController {
  constructor(private readonly lojaService: LojaPublicaService) {}

  @Get('home')
  @ApiOperation({ summary: 'Dados completos da home da loja (Público)' })
  getHome() {
    return this.lojaService.getHome();
  }

  @Get('edicao-ativa')
  @ApiOperation({ summary: 'Buscar apenas a edição ativa atual (Público)' })
  getEdicaoAtiva() {
    return this.lojaService.getEdicaoAtiva();
  }

  @Get('edicoes/:edicaoId/combos')
  @ApiOperation({
    summary:
      'Navegar pelos combos pré-definidos (1 por vez) de uma edição/combinação (Público)',
  })
  @ApiQuery({ name: 'tipoCartela', required: false, enum: TipoCartela })
  @ApiQuery({ name: 'quantidadeCartelas', required: false, type: Number })
  @ApiQuery({
    name: 'origemParticipacao',
    required: false,
    enum: OrigemParticipacao,
  })
  @ApiQuery({ name: 'cursorNumeroBase', required: false, type: String })
  @ApiQuery({
    name: 'direcao',
    required: false,
    enum: ['PROXIMO', 'ANTERIOR'],
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, deprecated: true })
  listarCombosDisponiveis(
    @Param('edicaoId', ParseUUIDPipe) edicaoId: string,
    @Query() filtros: ListarCombosLojaDto,
  ) {
    return this.lojaService.listarCombosDisponiveis(edicaoId, filtros);
  }

  @Post('comprar')
  @ApiOperation({ summary: 'Realizar pedido de compra / Checkout (Público)' })
  comprar(@Body() dto: ComprarLojaDto) {
    return this.lojaService.comprar(dto);
  }

  @Post('fale-conosco')
  @UseGuards(ThrottlerGuard)
  @Throttle({
    default: { limit: 3, ttl: 60_000, blockDuration: 300_000 },
  })
  @ApiOperation({
    summary:
      'Receber mensagem do formulário Fale Conosco (Público, com proteção anti-spam)',
  })
  enviarFaleConosco(@Body() dto: CreateFaleConoscoDto) {
    return this.lojaService.enviarFaleConosco(dto);
  }

  @Get('consultar-numeros/:cpf')
  @ApiOperation({ summary: 'Consultar números/bilhetes por CPF (Público)' })
  consultarNumeros(@Param('cpf') cpf: string) {
    return this.lojaService.consultarNumeros(cpf);
  }

  @Get('resultados')
  @ApiOperation({ summary: 'Últimos resultados de sorteios (Público)' })
  getResultados() {
    return this.lojaService.getResultados();
  }

  @Get('paginas/:slug')
  @ApiOperation({
    summary: 'Buscar conteúdo de página estática por slug (Público)',
  })
  getPagina(@Param('slug') slug: string) {
    return this.lojaService.getPagina(slug);
  }
}
