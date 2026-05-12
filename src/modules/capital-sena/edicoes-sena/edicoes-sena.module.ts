import { Module } from '@nestjs/common';
import { EdicoesSenaService } from './edicoes-sena.service';
import { EdicoesSenaController } from './edicoes-sena.controller';
import { S3UploadModule } from '../../../common/s3/s3-upload.module';

@Module({
  imports: [S3UploadModule],
  controllers: [EdicoesSenaController],
  providers: [EdicoesSenaService],
  exports: [EdicoesSenaService],
})
export class EdicoesSenaModule {}
