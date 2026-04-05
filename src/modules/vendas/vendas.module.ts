import { Module, forwardRef } from '@nestjs/common';
import { VendasController } from './vendas.controller';
import { VendasService } from './vendas.service';
import { PagamentosModule } from '../pagamentos/pagamentos.module';

@Module({
  imports: [forwardRef(() => PagamentosModule)],
  controllers: [VendasController],
  providers: [VendasService],
  exports: [VendasService],
})
export class VendasModule {}
