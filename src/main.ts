import { Logger, ValidationPipe } from '@nestjs/common';
import { criarExcecaoValidacao } from './common/utils/validation-errors.util';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { setupOpenApiDocs } from './common/docs/openapi-docs.util';
import { setupBullBoard } from './common/docs/bull-board.util';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RequestContextInterceptor } from './common/interceptors/request-context.interceptor';
import { runWithRequestContext } from './common/request-context/request-context.util';

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

function parseCorsOrigins(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter((origin) => origin.length > 0);
}

const exposedCorsHeaders = [
  'Content-Disposition',
  'Content-Length',
  'Content-Type',
  'X-Filename',
];

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.enableShutdownHooks();
  app.set('trust proxy', true);

  const host = config.get<string>('HOST', '0.0.0.0');
  const port = config.get<number>('PORT', 3000);
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';
  const requestBodyLimit = config.get<string>('REQUEST_BODY_LIMIT', '50mb');
  const frontendLojaUrl = config.get<string>(
    'FRONTEND_LOJA_URL',
    isProduction ? '' : 'http://localhost:3001',
  );
  const frontendLojaSenaUrl = config.get<string>(
    'FRONTEND_LOJA_SENA_URL',
    isProduction ? '' : 'http://localhost:3003',
  );
  const frontendAdminUrl = config.get<string>(
    'FRONTEND_ADMIN_URL',
    isProduction ? '' : 'http://localhost:3002',
  );
  const frontendAllowedOrigins = parseCorsOrigins(
    config.get<string>('FRONTEND_ALLOWED_ORIGINS'),
  );
  const developmentCorsOrigins = isProduction
    ? []
    : [
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3003',
        'http://localhost:8081',
      ];
  const corsOrigins = Array.from(
    new Set(
      [
        ...frontendAllowedOrigins,
        frontendLojaUrl,
        frontendLojaSenaUrl,
        frontendAdminUrl,
        ...developmentCorsOrigins,
      ]
        .filter((origin): origin is string => Boolean(origin?.trim()))
        .map((origin) => normalizeOrigin(origin)),
    ),
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
  app.disable('x-powered-by');
  app.use(compression());
  app.use((request: Request, _response: Response, next: NextFunction) => {
    runWithRequestContext(
      {
        requestId: randomUUID(),
        method: request.method,
        path: request.originalUrl ?? request.url,
        ip: request.ip,
        userAgent:
          typeof request.headers['user-agent'] === 'string'
            ? request.headers['user-agent']
            : undefined,
      },
      next,
    );
  });

  app.enableCors((request, callback) => {
    const originHeader = request.header('origin');

    if (!originHeader) {
      return callback(null, {
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: exposedCorsHeaders,
        credentials: true,
      });
    }

    const requestOrigin = normalizeOrigin(originHeader);
    const forwardedProto = request.header('x-forwarded-proto');
    const protocol = forwardedProto?.split(',')[0]?.trim() || request.protocol;
    const host = request.header('x-forwarded-host') || request.get('host');
    const currentHostOrigin = host
      ? normalizeOrigin(`${protocol}://${host}`)
      : undefined;

    const isAllowedConfiguredOrigin = corsOrigins.includes(requestOrigin);
    const isSameHostOrigin =
      currentHostOrigin !== undefined && requestOrigin === currentHostOrigin;

    if (isAllowedConfiguredOrigin || isSameHostOrigin) {
      return callback(null, {
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: exposedCorsHeaders,
        credentials: true,
      });
    }

    logger.warn(`CORS bloqueado para origem não autorizada: ${requestOrigin}`);
    return callback(null, {
      origin: false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: exposedCorsHeaders,
      credentials: true,
    });
  });

  logger.log(`CORS habilitado para origens: ${corsOrigins.join(', ')}`);

  app.useBodyParser('json', { limit: requestBodyLimit });
  app.useBodyParser('urlencoded', { limit: requestBodyLimit, extended: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: criarExcecaoValidacao,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new RequestContextInterceptor());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.setGlobalPrefix('api');

  if (!isProduction) {
    setupOpenApiDocs(app, port, logger);
  }

  setupBullBoard(app.getHttpAdapter().getInstance(), config, logger);

  await app.listen(port, host);

  logger.log(`🚀 Aplicação rodando em ${host}:${port}`);
  logger.log(`🌍 Ambiente: ${nodeEnv}`);
}

void bootstrap();
