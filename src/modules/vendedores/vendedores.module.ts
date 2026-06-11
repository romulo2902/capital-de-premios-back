import { Module } from '@nestjs/common';
import { VendedoresController } from './vendedores.controller';
import { VendedoresService } from './vendedores.service';
import { QrcodeModule } from '../qrcode/qrcode.module';

@Module({
  imports: [QrcodeModule],
  controllers: [VendedoresController],
  providers: [VendedoresService],
  exports: [VendedoresService],
})
export class VendedoresModule {}
