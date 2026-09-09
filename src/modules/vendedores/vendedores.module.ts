import { Module } from '@nestjs/common';
import { VendedoresController } from './vendedores.controller';
import { VendedoresPublicoController } from './vendedores-publico.controller';
import { VendedoresService } from './vendedores.service';
import { QrcodeModule } from '../qrcode/qrcode.module';

@Module({
  imports: [QrcodeModule],
  controllers: [VendedoresController, VendedoresPublicoController],
  providers: [VendedoresService],
  exports: [VendedoresService],
})
export class VendedoresModule {}
