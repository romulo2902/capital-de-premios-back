import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MaquininhasController } from './maquininhas.controller';
import { MaquininhasService } from './maquininhas.service';
import { CreditosMaquininhaService } from './creditos-maquininha.service';

/**
 * As maquininhas são operadas por duas superfícies: o painel administrativo
 * (controller daqui, ADMIN + DISTRIBUIDOR) e o terminal POS (rotas no
 * `PosController`). O service é exportado para o POS reaproveitar as regras.
 *
 * `CreditosMaquininhaService` também é exportado porque as vendas — Capital
 * Prêmios e Sena — precisam debitar e estornar dentro da transação delas.
 * Este módulo só depende do `PrismaModule`, então quem vende pode importá-lo
 * sem `forwardRef`.
 */
@Module({
  imports: [PrismaModule],
  controllers: [MaquininhasController],
  providers: [MaquininhasService, CreditosMaquininhaService],
  exports: [MaquininhasService, CreditosMaquininhaService],
})
export class MaquininhasModule {}
