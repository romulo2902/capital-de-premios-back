import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { LojaPublicaService } from './loja-publica.service';
import { ComprarLojaDto } from './dto/comprar-loja.dto';

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

  @Post('comprar')
  @ApiOperation({ summary: 'Realizar pedido de compra / Checkout (Público)' })
  comprar(@Body() dto: ComprarLojaDto) {
    return this.lojaService.comprar(dto);
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
  @ApiOperation({ summary: 'Buscar conteúdo de página estática por slug (Público)' })
  getPagina(@Param('slug') slug: string) {
    return this.lojaService.getPagina(slug);
  }
}
