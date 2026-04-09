import { Module } from '@nestjs/common';
import { SorteioController } from './sorteio.controller';
import { LojaSorteioController } from './loja-sorteio.controller';
import { SorteioService } from './sorteio.service';

@Module({
  controllers: [SorteioController, LojaSorteioController],
  providers: [SorteioService],
  exports: [SorteioService],
})
export class SorteioModule {}
