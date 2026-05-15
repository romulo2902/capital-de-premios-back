import { Module } from '@nestjs/common';
import { QrcodeController } from './qrcode.controller';
import { QrcodeService } from './qrcode.service';
import { S3UploadModule } from '../../common/s3/s3-upload.module';

@Module({
  imports: [S3UploadModule],
  controllers: [QrcodeController],
  providers: [QrcodeService],
  exports: [QrcodeService],
})
export class QrcodeModule {}
