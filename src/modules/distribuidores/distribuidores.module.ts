import { Module } from '@nestjs/common';
import { DistribuidoresController } from './distribuidores.controller';
import { DistribuidoresService } from './distribuidores.service';

@Module({
  controllers: [DistribuidoresController],
  providers: [DistribuidoresService],
  exports: [DistribuidoresService],
})
export class DistribuidoresModule {}
