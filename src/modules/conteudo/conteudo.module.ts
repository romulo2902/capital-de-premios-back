import { Module } from '@nestjs/common';
import { ConteudoService } from './conteudo.service';
import { ConteudoController } from './conteudo.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ConteudoController],
  providers: [ConteudoService],
  exports: [ConteudoService]
})
export class ConteudoModule {}
