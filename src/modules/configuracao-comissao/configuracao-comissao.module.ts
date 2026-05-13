import { Module } from '@nestjs/common';
import { ConfiguracaoComissaoController } from './configuracao-comissao.controller';
import { ConfiguracaoComissaoService } from './configuracao-comissao.service';

@Module({
  controllers: [ConfiguracaoComissaoController],
  providers: [ConfiguracaoComissaoService],
  exports: [ConfiguracaoComissaoService],
})
export class ConfiguracaoComissaoModule {}
