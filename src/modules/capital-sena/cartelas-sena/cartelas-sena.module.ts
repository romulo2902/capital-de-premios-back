import { Module } from '@nestjs/common';
import { CartelasSenaService } from './cartelas-sena.service';
import {
  CartelasSenaController,
  CartelasSenaAdminController,
} from './cartelas-sena.controller';

@Module({
  controllers: [CartelasSenaController, CartelasSenaAdminController],
  providers: [CartelasSenaService],
  exports: [CartelasSenaService],
})
export class CartelasSenaModule {}
