import { Module } from '@nestjs/common';
import { DistribuidorLojaController } from './distribuidor-loja.controller';
import { DistribuidorLojaService } from './distribuidor-loja.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DistribuidorLojaController],
  providers: [DistribuidorLojaService],
})
export class DistribuidorLojaModule {}
