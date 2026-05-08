import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WhatsappApiController } from './whatsapp-api.controller';
import { WhatsappApiService } from './whatsapp-api.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { VendasModule } from '../vendas/vendas.module';
import { PagamentosModule } from '../pagamentos/pagamentos.module';
import { RedisModule } from '../../common/redis/redis.module';

@Module({
  imports: [
    PrismaModule,
    VendasModule,
    PagamentosModule,
    RedisModule,
    // JwtModule sem configuração estática — a estratégia JWT global já cuida
    // da validação; aqui precisamos apenas do JwtService para assinar tokens de cliente.
    JwtModule.register({}),
  ],
  controllers: [WhatsappApiController],
  providers: [WhatsappApiService],
})
export class WhatsappApiModule {}
