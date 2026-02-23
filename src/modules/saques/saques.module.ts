import { Module } from '@nestjs/common';
import { SaquesController } from './saques.controller';
import { SaquesService } from './saques.service';

@Module({
  controllers: [SaquesController],
  providers: [SaquesService],
  exports: [SaquesService],
})
export class SaquesModule {}
