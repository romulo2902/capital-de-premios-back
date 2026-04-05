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
import { LojaPublicaModule } from './modules/loja-publica/loja-publica.module';
import { ConteudoModule } from './modules/conteudo/conteudo.module';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const envFilePathByEnvironment: Record<string, string[]> = {
  development: ['.env.development', '.env'],
  homolog: ['.env.homolog', '.env'],
  production: ['.env.production', '.env'],
  test: ['.env.test', '.env'],
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Em homologação/produção, variáveis exportadas pelo sistema continuam valendo.
      // Quando existir um arquivo .env do ambiente, ele também será carregado.
      envFilePath: envFilePathByEnvironment[nodeEnv] ?? [
        `.env.${nodeEnv}`,
        '.env',
      ],
      ignoreEnvFile: false,
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
    LojaPublicaModule,
    ConteudoModule,
  ],
})
export class AppModule {}
