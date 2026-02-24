import { Module } from '@nestjs/common';
import { SorteioController } from './sorteio.controller';
import { SorteioService } from './sorteio.service';

@Module({
  controllers: [SorteioController],
  providers: [SorteioService],
  exports: [SorteioService],
})
export class SorteioModule {}
