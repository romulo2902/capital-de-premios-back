import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { VendedoresService } from './vendedores.service';
import { AutoCadastroVendedorDto } from './dto/auto-cadastro-vendedor.dto';

/**
 * Auto-cadastro de vendedor pelo link do distribuidor.
 *
 * Rotas **sem autenticação** — de propósito: quem preenche o formulário ainda
 * não tem conta. O que substitui o token de acesso é o token da URL, que diz
 * em qual rede o cadastro entra, e a aprovação do distribuidor, sem a qual o
 * vendedor não entra em canal nenhum.
 */
@ApiTags('Público / Cadastro de Vendedor')
@Controller('publico/cadastro-vendedor')
export class VendedoresPublicoController {
  constructor(private readonly vendedoresService: VendedoresService) {}

  @Get(':token')
  @ApiOperation({
    summary: 'Validar link de cadastro e identificar a rede (público)',
    description:
      'Chamada pelo formulário ao abrir, para mostrar em qual rede a pessoa ' +
      'está se cadastrando e para não deixá-la preencher tudo antes de ' +
      'descobrir que o link morreu. Token inválido, revogado ou de ' +
      'distribuidor inativo responde 404 — sem distinguir os casos, para não ' +
      'transformar a rota em oráculo de tokens válidos.',
  })
  @ApiParam({
    name: 'token',
    description: 'Token do link fornecido pelo distribuidor.',
  })
  @ApiResponse({
    status: 200,
    description: 'Link válido.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Operação realizada com sucesso',
        data: {
          id: '91618a6d-e0d0-4d12-a997-80ed804d1387',
          nome: 'Distribuidora Norte',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Link inválido ou expirado.' })
  validarLink(@Param('token') token: string) {
    return this.vendedoresService.buscarRedePorTokenDeCadastro(token);
  }

  @Post(':token')
  @ApiOperation({
    summary: 'Enviar auto-cadastro de vendedor (público)',
    description:
      'Cria o vendedor **pendente**: ele nasce inativo e não acessa o painel ' +
      'nem o POS até o distribuidor aprovar em `PATCH /admin/vendedores/{id}/aprovar`. ' +
      'A rede sai do token da URL — o corpo não aceita `distribuidorId`, ' +
      '`comissaoPercent` nem `status`, e mandá-los devolve 400.',
  })
  @ApiParam({
    name: 'token',
    description: 'Token do link fornecido pelo distribuidor.',
  })
  @ApiResponse({
    status: 201,
    description: 'Cadastro recebido, aguardando aprovação.',
  })
  @ApiResponse({
    status: 400,
    description: 'Formulário inválido ou com campo não permitido.',
  })
  @ApiResponse({ status: 404, description: 'Link inválido ou expirado.' })
  @ApiResponse({ status: 409, description: 'CPF ou e-mail já cadastrado.' })
  autoCadastrar(
    @Param('token') token: string,
    @Body() dto: AutoCadastroVendedorDto,
  ) {
    return this.vendedoresService.autoCadastrar(token, dto);
  }
}
