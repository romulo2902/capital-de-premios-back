import { Module } from '@nestjs/common';
import { S3UploadModule } from '../../common/s3/s3-upload.module';
import { BannersController } from './banners.controller';
import { BannersPublicController } from './banners-public.controller';
import { BannersService } from './banners.service';

@Module({
  imports: [S3UploadModule],
  controllers: [BannersController, BannersPublicController],
  providers: [BannersService],
  exports: [BannersService],
})
export class BannersModule {}
