import { Module } from '@nestjs/common';
import { LojaPublicaService } from './loja-publica.service';
import { LojaPublicaController } from './loja-publica.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { VendasModule } from '../vendas/vendas.module';
import { ConteudoModule } from '../conteudo/conteudo.module';
import { PagamentosModule } from '../pagamentos/pagamentos.module';

@Module({
  imports: [PrismaModule, VendasModule, PagamentosModule, ConteudoModule],
  controllers: [LojaPublicaController],
  providers: [LojaPublicaService],
})
export class LojaPublicaModule {}
