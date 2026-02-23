import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { SorteioController } from './sorteio.controller';
import { SorteioService } from './sorteio.service';
import { SorteioGateway } from './sorteio.gateway';

@Module({
  imports: [JwtModule.register({}), ConfigModule],
  controllers: [SorteioController],
  providers: [SorteioService, SorteioGateway],
  exports: [SorteioService],
})
export class SorteioModule {}
