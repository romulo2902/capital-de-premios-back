import { Module } from '@nestjs/common';
import { ClientesController } from './clientes.controller';
import { MeusDadosController } from './meus-dados.controller';
import { ClientesService } from './clientes.service';

@Module({
  controllers: [ClientesController, MeusDadosController],
  providers: [ClientesService],
  exports: [ClientesService],
})
export class ClientesModule {}
