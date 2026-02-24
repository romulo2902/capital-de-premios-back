import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SorteioService } from './sorteio.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Sorteio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/sorteio')
export class SorteioController {
  constructor(private readonly sorteioService: SorteioService) {}

  @Get()
  @ApiOperation({ summary: 'Listar sorteios' })
  findAll() {
    return this.sorteioService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar sorteio por edição' })
  findOne(@Param('id') id: string) {
    return this.sorteioService.findOne(id);
  }

  @Post(':edicaoId/iniciar')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Iniciar apuração do sorteio (ADMIN)' })
  iniciarSorteio(@Param('edicaoId') edicaoId: string) {
    return this.sorteioService.iniciarSorteio(edicaoId);
  }
}
