import { Module } from '@nestjs/common';
import { BilhetesController } from './bilhetes.controller';
import { BilhetesService } from './bilhetes.service';

@Module({
  controllers: [BilhetesController],
  providers: [BilhetesService],
  exports: [BilhetesService],
})
export class BilhetesModule {}
