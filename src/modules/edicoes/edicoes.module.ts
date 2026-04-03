import { Module } from '@nestjs/common';
import { EdicoesController } from './edicoes.controller';
import { EdicoesService } from './edicoes.service';
import { S3UploadModule } from '../../common/s3/s3-upload.module';

@Module({
  imports: [S3UploadModule],
  controllers: [EdicoesController],
  providers: [EdicoesService],
  exports: [EdicoesService],
})
export class EdicoesModule {}
