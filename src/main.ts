import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const helmet = require('helmet');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compression = require('compression');
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const port = config.get<number>('PORT', 3000);
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  const frontendLojaUrl = config.get<string>('FRONTEND_LOJA_URL', 'http://localhost:3001');
  const frontendAdminUrl = config.get<string>('FRONTEND_ADMIN_URL', 'http://localhost:3002');

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

  // Swagger
  const swaggerUser = config.get<string>('SWAGGER_USER', 'admin');
  const swaggerPass = config.get<string>('SWAGGER_PASS', 'admin');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Capital de Prêmios API')
    .setDescription('API para plataforma de vendas de bilhetes e sorteios')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  if (nodeEnv === 'production') {
    // Basic auth for Swagger in production
    app.use('/api/docs', (req: any, res: any, next: any) => {
      const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
      const [user, pass] = Buffer.from(b64auth, 'base64').toString().split(':');
      if (user === swaggerUser && pass === swaggerPass) return next();
      res.set('WWW-Authenticate', 'Basic realm="Swagger"');
      res.status(401).send('Autenticação necessária');
    });
  }

  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);
  logger.log(`🚀 Aplicação rodando na porta ${port}`);
  logger.log(`📚 Swagger disponível em: http://localhost:${port}/api/docs`);
  logger.log(`🌍 Ambiente: ${nodeEnv}`);
}

bootstrap();
