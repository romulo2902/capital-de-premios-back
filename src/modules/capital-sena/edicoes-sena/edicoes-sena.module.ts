import { Module } from '@nestjs/common';
import { EdicoesSenaService } from './edicoes-sena.service';
import { EdicoesSenaController } from './edicoes-sena.controller';

@Module({
  controllers: [EdicoesSenaController],
  providers: [EdicoesSenaService],
  exports: [EdicoesSenaService],
})
export class EdicoesSenaModule {}
