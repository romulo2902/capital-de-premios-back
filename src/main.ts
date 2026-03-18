import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
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
  const frontendLojaUrl = config.get<string>(
    'FRONTEND_LOJA_URL',
    'http://localhost:3001',
  );
  const frontendAdminUrl = config.get<string>(
    'FRONTEND_ADMIN_URL',
    'http://localhost:3002',
  );

  // Security
  app.use(helmet());
  app.use(compression());

  // CORS
  app.enableCors({
    origin: [frontendLojaUrl, frontendAdminUrl],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Global Pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global Filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global Interceptors
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Global Prefix
  app.setGlobalPrefix('api');

  // Swagger — apenas em desenvolvimento
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Capital de Prêmios API')
      .setDescription(
        `## Contextos de acesso\n\n` +
          `### 🖥️ Painel Admin — \`/api/admin/*\`\n` +
          `Rotas restritas a **ADMIN** e **DISTRIBUIDOR**. Autenticação via \`POST /api/auth/login\` (email + senha).\n\n` +
          `### 🛒 Loja Web — \`/api/*\`\n` +
          `Rotas da loja. **VENDEDOR** autentica com email+senha, **CLIENTE** autentica com CPF via \`POST /api/auth/loja\`.\n\n` +
          `---\n\n` +
          `> 🔐  Clique em **Authorize** e informe o \`accessToken\` retornado pelo login.`,
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    logger.log(`📚 Swagger disponível em: http://localhost:${port}/api/docs`);
  }

  await app.listen(port, host);
  logger.log(`🚀 Aplicação rodando em ${host}:${port}`);
  logger.log(`🌍 Ambiente: ${nodeEnv}`);
}

void bootstrap();
