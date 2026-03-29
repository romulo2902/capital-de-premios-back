import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { setupOpenApiDocs } from './common/docs/openapi-docs.util';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.enableShutdownHooks();

  const host = config.get<string>('HOST', '0.0.0.0');
  const port = config.get<number>('PORT', 3000);
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';
  const frontendLojaUrl = config.get<string>(
    'FRONTEND_LOJA_URL',
    'http://localhost:3001',
  );
  const frontendAdminUrl = config.get<string>(
    'FRONTEND_ADMIN_URL',
    'http://localhost:3002',
  );

  app.use(
    helmet({
      // Em homologacao/local via IP puro, HSTS/CSP podem forcar comportamento
      // de HTTPS no navegador e atrapalhar o acesso ao Swagger e aos assets.
      hsts: isProduction,
      contentSecurityPolicy: isProduction ? undefined : false,
      crossOriginResourcePolicy: isProduction ? undefined : false,
    }),
  );
  app.use(compression());

  app.enableCors({
    origin: [frontendLojaUrl, frontendAdminUrl],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.setGlobalPrefix('api');

  if (!isProduction) {
    setupOpenApiDocs(app, port, logger);
  }

  await app.listen(port, host);
  logger.log(`🚀 Aplicação rodando em ${host}:${port}`);
  logger.log(`🌍 Ambiente: ${nodeEnv}`);
}

void bootstrap();
