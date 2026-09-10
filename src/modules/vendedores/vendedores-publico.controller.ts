import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
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
// `ThrottlerModule` esta registrado no app, mas sem `APP_GUARD`: o guard e
// opt-in por rota, como no formulario publico da loja. Sem ele, um POST sem
// autenticacao que faz bcrypt e duas insercoes por chamada e alavanca de graca.
@UseGuards(ThrottlerGuard)
@Controller('publico/cadastro-vendedor')
export class VendedoresPublicoController {
  constructor(private readonly vendedoresService: VendedoresService) {}

  @Get(':token')
  // Uma chamada por abertura do formulario, e o custo e uma consulta indexada.
  // O teto e alto porque a chave e o IP: atras de CGNAT ou do wifi de um
  // evento, dezenas de candidatos legitimos saem do mesmo endereco.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
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
  // Dimensionado para o uso real desta rota, que nao e o do "fale conosco":
  // ali cada pessoa envia uma vez na vida, aqui um distribuidor cadastra gente
  // em lote, e todo mundo costuma sair do mesmo IP (CGNAT do celular, wifi do
  // evento). Com 3/min e bloqueio de 5min, o quarto candidato do lote levava
  // porta na cara — junto com estranhos no mesmo CGNAT.
  //
  // 20/min ainda limita o custo de CPU do bcrypt (cost 10, ~100ms) a cerca de
  // 2s por minuto por IP, e o bloqueio igual a janela faz quem estourar esperar
  // um minuto, nao cinco.
  @Throttle({ default: { limit: 20, ttl: 60_000, blockDuration: 60_000 } })
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
  @ApiResponse({
    status: 409,
    description:
      'CPF ou e-mail já cadastrado. Distingue cadastro existente de novo para ' +
      'um chamador sem autenticação — é enumeração aceita de propósito, porque ' +
      'esconder isso custaria o retorno de quem digitou o CPF errado. O que ' +
      'limita varredura em massa é o rate limit da rota.',
  })
  autoCadastrar(
    @Param('token') token: string,
    @Body() dto: AutoCadastroVendedorDto,
  ) {
    return this.vendedoresService.autoCadastrar(token, dto);
  }
}
