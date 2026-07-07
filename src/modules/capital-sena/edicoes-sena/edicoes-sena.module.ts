import { Module } from '@nestjs/common';
import { EdicoesSenaService } from './edicoes-sena.service';
import { EdicoesSenaCronService } from './edicoes-sena.cron';
import {
  EdicoesSenaController,
  EdicoesSenaPublicoController,
} from './edicoes-sena.controller';
import { S3UploadModule } from '../../../common/s3/s3-upload.module';

@Module({
  imports: [S3UploadModule],
  controllers: [EdicoesSenaController, EdicoesSenaPublicoController],
  providers: [EdicoesSenaService, EdicoesSenaCronService],
  exports: [EdicoesSenaService],
})
export class EdicoesSenaModule {}
