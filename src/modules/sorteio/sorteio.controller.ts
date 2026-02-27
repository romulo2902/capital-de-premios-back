import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SorteioService } from './sorteio.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Admin / Sorteio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/sorteio')
export class SorteioController {
  constructor(private readonly sorteioService: SorteioService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Listar sorteios (ADMIN)' })
  findAll() {
    return this.sorteioService.findAll();
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Buscar sorteio por edição (ADMIN)' })
  findOne(@Param('id') id: string) {
    return this.sorteioService.findOne(id);
  }

  @Post(':edicaoId/iniciar')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Iniciar apuração do sorteio (ADMIN apenas)' })
  iniciarSorteio(@Param('edicaoId') edicaoId: string) {
    return this.sorteioService.iniciarSorteio(edicaoId);
  }
}
