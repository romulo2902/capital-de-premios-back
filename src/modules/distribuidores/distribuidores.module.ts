import { Module } from '@nestjs/common';
import { DistribuidoresController } from './distribuidores.controller';
import { DistribuidoresService } from './distribuidores.service';
import { QrcodeModule } from '../qrcode/qrcode.module';

@Module({
  imports: [QrcodeModule],
  controllers: [DistribuidoresController],
  providers: [DistribuidoresService],
  exports: [DistribuidoresService],
})
export class DistribuidoresModule {}
