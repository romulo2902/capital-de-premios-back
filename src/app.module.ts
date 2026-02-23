import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { VendedoresModule } from './modules/vendedores/vendedores.module';
import { DistribuidoresModule } from './modules/distribuidores/distribuidores.module';
import { EdicoesModule } from './modules/edicoes/edicoes.module';
import { RangesModule } from './modules/ranges/ranges.module';
import { VendasModule } from './modules/vendas/vendas.module';
import { BilhetesModule } from './modules/bilhetes/bilhetes.module';
import { PagamentosModule } from './modules/pagamentos/pagamentos.module';
import { SorteioModule } from './modules/sorteio/sorteio.module';
import { ComissoesModule } from './modules/comissoes/comissoes.module';
import { SaquesModule } from './modules/saques/saques.module';
import { RelatoriosModule } from './modules/relatorios/relatorios.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { QrcodeModule } from './modules/qrcode/qrcode.module';
import { MigracaoModule } from './modules/migracao/migracao.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Em produção (EC2) as variáveis vêm do ambiente do sistema.
      // Em desenvolvimento, carrega o .env.development via docker-compose.
      envFilePath: process.env.NODE_ENV === 'production' ? [] : ['.env.development', '.env'],
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL', 60) * 1000,
            limit: config.get<number>('THROTTLE_LIMIT', 100),
          },
        ],
      }),
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL', 'redis://localhost:6379'),
        },
      }),
    }),
    PrismaModule,
    AuthModule,
    UsuariosModule,
    ClientesModule,
    VendedoresModule,
    DistribuidoresModule,
    EdicoesModule,
    RangesModule,
    VendasModule,
    BilhetesModule,
    PagamentosModule,
    SorteioModule,
    ComissoesModule,
    SaquesModule,
    RelatoriosModule,
    DashboardModule,
    QrcodeModule,
    MigracaoModule,
  ],
})
export class AppModule {}
