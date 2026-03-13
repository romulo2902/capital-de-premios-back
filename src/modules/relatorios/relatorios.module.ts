import { Module } from '@nestjs/common';
import { RelatoriosClientesController } from './relatorios-clientes.controller';
import { RelatoriosComissoesController } from './relatorios-comissoes.controller';
import { RelatoriosController } from './relatorios.controller';
import { RelatoriosDistribuidoresController } from './relatorios-distribuidores.controller';
import { RelatoriosService } from './relatorios.service';
import { RelatoriosVendasController } from './relatorios-vendas.controller';
import { RelatoriosVendedoresController } from './relatorios-vendedores.controller';

@Module({
  controllers: [
    RelatoriosController,
    RelatoriosVendasController,
    RelatoriosComissoesController,
    RelatoriosVendedoresController,
    RelatoriosDistribuidoresController,
    RelatoriosClientesController,
  ],
  providers: [RelatoriosService],
})
export class RelatoriosModule {}
