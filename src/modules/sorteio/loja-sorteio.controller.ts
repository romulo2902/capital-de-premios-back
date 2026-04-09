import { Controller, Get, Param, UseGuards, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { SorteioService } from './sorteio.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

interface JwtPayload {
  sub: string;
  perfil: string;
  clienteId?: string;
}

@ApiTags('Loja / Sorteio')
@Controller('loja/sorteio')
export class LojaSorteioController {
  constructor(private readonly sorteioService: SorteioService) {}

  @Get(':edicaoId/estado')
  @ApiOperation({
    summary: 'Obter estado atual do sorteio (público)',
    description:
      'Retorna o estado atual do sorteio de uma edição, incluindo números marcados por prêmio. ' +
      'O cliente usa este endpoint para obter o estado inicial antes de escutar eventos do Firestore.',
  })
  @ApiParam({ name: 'edicaoId', description: 'ID da edição (UUID)' })
  obterEstado(@Param('edicaoId') edicaoId: string) {
    return this.sorteioService.obterEstadoSorteio(edicaoId);
  }

  @Get(':edicaoId/meus-bilhetes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obter meus bilhetes para uma edição (CLIENTE)',
    description:
      'Retorna os bilhetes do cliente autenticado para a edição informada. ' +
      'Cada bilhete contém sua sequência de bolas para o cliente marcar durante o sorteio.',
  })
  @ApiParam({ name: 'edicaoId', description: 'ID da edição (UUID)' })
  async meusBilhetes(
    @Param('edicaoId') edicaoId: string,
    @Req() req: { user: JwtPayload },
  ) {
    const user = req.user;

    // Buscar clienteId a partir do usuário JWT
    // O token do cliente tem o clienteId diretamente ou o sub aponta para o Usuario
    const clienteId = user.clienteId ?? user.sub;

    return this.sorteioService.obterBilhetesCliente(edicaoId, clienteId);
  }
}
