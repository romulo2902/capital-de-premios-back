import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
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
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { FirebaseModule } from './common/firebase/firebase.module';
import { RedisModule } from './common/redis/redis.module';
import { RedisService } from './common/redis/redis.service';
import { RedisThrottlerStorageService } from './common/throttler/redis-throttler-storage.service';
import { WhatsappApiModule } from './modules/whatsapp-api/whatsapp-api.module';
import { CapitalSenaModule } from './modules/capital-sena/capital-sena.module';
import { PosModule } from './modules/pos/pos.module';
import { ConfiguracaoComissaoModule } from './modules/configuracao-comissao/configuracao-comissao.module';
import { BannersModule } from './modules/banners/banners.module';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const envFilePathByEnvironment: Record<string, string[]> = {
  development: ['.env.development', '.env'],
  homolog: ['.env.homolog', '.env'],
  production: ['.env.production', '.env'],
  test: ['.env.test', '.env'],
};

@Module({
  controllers: [AppController],
  providers: [AppService],
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
      imports: [ConfigModule, RedisModule],
      inject: [ConfigService, RedisService],
      useFactory: (
        config: ConfigService,
        redisService: RedisService,
      ) => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL', 60) * 1000,
            limit: config.get<number>('THROTTLE_LIMIT', 100),
          },
        ],
        // Storage distribuído para funcionar corretamente com múltiplas réplicas.
        // Instanciado aqui para evitar dependência de provider fora do escopo interno do ThrottlerModule.
        storage: new RedisThrottlerStorageService(redisService),
      }),
    }),
    RedisModule,
    PrismaModule,
    FirebaseModule,
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
    AuditoriaModule,
    WhatsappApiModule,
    CapitalSenaModule,
    ConfiguracaoComissaoModule,
    BannersModule,
    PosModule,
  ],
})
export class AppModule {}
