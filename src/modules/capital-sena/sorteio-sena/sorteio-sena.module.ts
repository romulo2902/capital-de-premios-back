import { Module } from '@nestjs/common';
import { SorteioSenaService } from './sorteio-sena.service';
import { SorteioSenaController, SorteioSenaPublicoController } from './sorteio-sena.controller';
import { S3UploadModule } from '../../../common/s3/s3-upload.module';

@Module({
  imports: [S3UploadModule],
  controllers: [SorteioSenaController, SorteioSenaPublicoController],
  providers: [SorteioSenaService],
  exports: [SorteioSenaService],
})
export class SorteioSenaModule {}
