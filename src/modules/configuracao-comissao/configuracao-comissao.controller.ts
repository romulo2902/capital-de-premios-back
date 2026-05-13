import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ConfiguracaoComissaoService } from './configuracao-comissao.service';
import { UpsertConfiguracaoComissaoDto } from './dto/upsert-configuracao-comissao.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Configuração de Comissão')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/configuracao-comissao')
export class ConfiguracaoComissaoController {
  constructor(
    private readonly configuracaoComissaoService: ConfiguracaoComissaoService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Obtém os percentuais globais de comissão padrão (distribuidor e vendedor)',
  })
  obter() {
    return this.configuracaoComissaoService.obter();
  }

  @Patch()
  @ApiOperation({
    summary:
      'Define/atualiza os percentuais globais de comissão padrão. Esses valores são usados quando o distribuidor ou vendedor não possuem percentual próprio configurado.',
  })
  atualizar(@Body() dto: UpsertConfiguracaoComissaoDto) {
    return this.configuracaoComissaoService.atualizar(dto);
  }
}
