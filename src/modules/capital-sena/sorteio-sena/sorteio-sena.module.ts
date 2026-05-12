import { Module } from '@nestjs/common';
import { SorteioSenaService } from './sorteio-sena.service';
import { SorteioSenaController, SorteioSenaPublicoController } from './sorteio-sena.controller';

@Module({
  controllers: [SorteioSenaController, SorteioSenaPublicoController],
  providers: [SorteioSenaService],
  exports: [SorteioSenaService],
})
export class SorteioSenaModule {}
