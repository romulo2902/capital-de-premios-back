import { Module } from '@nestjs/common';
import { EdicoesSenaModule } from './edicoes-sena/edicoes-sena.module';
import { VendasSenaModule } from './vendas-sena/vendas-sena.module';
import { SorteioSenaModule } from './sorteio-sena/sorteio-sena.module';
import { ApuracaoSenaModule } from './apuracao-sena/apuracao-sena.module';
import { CartelasSenaModule } from './cartelas-sena/cartelas-sena.module';

@Module({
  imports: [
    EdicoesSenaModule,
    VendasSenaModule,
    SorteioSenaModule,
    ApuracaoSenaModule,
    CartelasSenaModule,
  ],
})
export class CapitalSenaModule {}
