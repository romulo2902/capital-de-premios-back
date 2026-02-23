import { Module } from '@nestjs/common';
import { EdicoesController } from './edicoes.controller';
import { EdicoesService } from './edicoes.service';

@Module({
  controllers: [EdicoesController],
  providers: [EdicoesService],
  exports: [EdicoesService],
})
export class EdicoesModule {}
