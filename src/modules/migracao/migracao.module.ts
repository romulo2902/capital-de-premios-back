import { Module } from '@nestjs/common';
import { MigracaoController } from './migracao.controller';
import { MigracaoService } from './migracao.service';

@Module({
  controllers: [MigracaoController],
  providers: [MigracaoService],
  exports: [MigracaoService],
})
export class MigracaoModule {}
