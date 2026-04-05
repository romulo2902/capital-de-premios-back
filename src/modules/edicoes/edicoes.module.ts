import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EdicoesController } from './edicoes.controller';
import { EdicoesService } from './edicoes.service';
import { S3UploadModule } from '../../common/s3/s3-upload.module';
import { EdicoesRangesProcessor } from './edicoes-ranges.processor';
import { EDICOES_RANGES_QUEUE } from './edicoes-ranges.constants';

@Module({
  imports: [
    S3UploadModule,
    BullModule.registerQueue({
      name: EDICOES_RANGES_QUEUE,
    }),
  ],
  controllers: [EdicoesController],
  providers: [EdicoesService, EdicoesRangesProcessor],
  exports: [EdicoesService],
})
export class EdicoesModule {}
