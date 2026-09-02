import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MaquininhasController } from './maquininhas.controller';
import { MaquininhasService } from './maquininhas.service';

/**
 * As maquininhas são operadas por duas superfícies: o painel administrativo
 * (controller daqui, ADMIN + DISTRIBUIDOR) e o terminal POS (rotas no
 * `PosController`). O service é exportado para o POS reaproveitar as regras.
 */
@Module({
  imports: [PrismaModule],
  controllers: [MaquininhasController],
  providers: [MaquininhasService],
  exports: [MaquininhasService],
})
export class MaquininhasModule {}
