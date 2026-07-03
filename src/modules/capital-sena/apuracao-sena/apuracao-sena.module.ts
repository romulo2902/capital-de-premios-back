import { Module } from '@nestjs/common';
import { ApuracaoSenaService } from './apuracao-sena.service';
import { ApuracaoSenaController } from './apuracao-sena.controller';

@Module({
  controllers: [ApuracaoSenaController],
  providers: [ApuracaoSenaService],
  exports: [ApuracaoSenaService],
})
export class ApuracaoSenaModule {}
