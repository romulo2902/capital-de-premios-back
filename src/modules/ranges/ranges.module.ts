import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { RangesController } from './ranges.controller';
import { RangesService } from './ranges.service';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 500 * 1024 * 1024, // 500 MB
      },
    }),
  ],
  controllers: [RangesController],
  providers: [RangesService],
  exports: [RangesService],
})
export class RangesModule {}
