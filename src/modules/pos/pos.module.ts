import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { VendasModule } from '../vendas/vendas.module';
import { VendasSenaModule } from '../capital-sena/vendas-sena/vendas-sena.module';
import { PagamentosModule } from '../pagamentos/pagamentos.module';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { PosAuthService } from './pos-auth.service';
import { JwtPosStrategy } from './strategies/jwt-pos.strategy';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    ConfigModule,
    JwtModule.register({}),
    VendasModule,
    VendasSenaModule,
    PagamentosModule,
  ],
  controllers: [PosController],
  providers: [PosService, PosAuthService, JwtPosStrategy],
})
export class PosModule {}
