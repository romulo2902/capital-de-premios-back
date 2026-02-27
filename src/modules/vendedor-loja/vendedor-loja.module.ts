import { Module } from '@nestjs/common';
import { VendedorLojaController } from './vendedor-loja.controller';
import { VendedorLojaService } from './vendedor-loja.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VendedorLojaController],
  providers: [VendedorLojaService],
})
export class VendedorLojaModule {}
