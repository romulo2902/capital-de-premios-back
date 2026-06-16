import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response, NextFunction, Express } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { timingSafeEqual } from 'node:crypto';
import { Queue } from 'bullmq';

const BULL_BOARD_PATH = '/api/admin/filas';
const BULL_BOARD_FALLBACK_PATH = '/admin/filas';
const AUTO_ENCERRAMENTO_QUEUE_NAME = 'edicoes-auto-encerramento';
const VENDAS_POS_RECONCILIACAO_QUEUE_NAME = 'vendas-pos-reconciliacao';

export function setupBullBoard(
  app: Express,
  config: ConfigService,
  logger: Logger,
): void {
  const redisUrl = config.get<string>('REDIS_URL');
  if (!redisUrl) {
    logger.warn('Bull Board desabilitado: REDIS_URL não configurada');
    return;
  }

  const user =
    config.get<string>('BULL_BOARD_USER')?.trim() ??
    config.get<string>('SWAGGER_USER')?.trim();
  const pass =
    config.get<string>('BULL_BOARD_PASS')?.trim() ??
    config.get<string>('SWAGGER_PASS')?.trim();

  if (!user || !pass) {
    logger.warn(
      'Bull Board desabilitado: configure BULL_BOARD_USER/BULL_BOARD_PASS ou SWAGGER_USER/SWAGGER_PASS',
    );
    return;
  }

  const queues = [
    new Queue(AUTO_ENCERRAMENTO_QUEUE_NAME, {
      connection: { url: redisUrl },
    }),
    new Queue(VENDAS_POS_RECONCILIACAO_QUEUE_NAME, {
      connection: { url: redisUrl },
    }),
  ];
  const authMiddleware = buildBasicAuthMiddleware(user, pass);
  const port = config.get<number>('PORT', 3000);

  const primaryAdapter = new ExpressAdapter();
  primaryAdapter.setBasePath(BULL_BOARD_PATH);
  createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter: primaryAdapter,
  });
  app.use(BULL_BOARD_PATH, authMiddleware);
  app.use(BULL_BOARD_PATH, primaryAdapter.getRouter());

  const fallbackAdapter = new ExpressAdapter();
  fallbackAdapter.setBasePath(BULL_BOARD_FALLBACK_PATH);
  createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter: fallbackAdapter,
  });
  app.use(BULL_BOARD_FALLBACK_PATH, authMiddleware);
  app.use(BULL_BOARD_FALLBACK_PATH, fallbackAdapter.getRouter());

  logger.log(
    `📚 Bull Board: http://localhost:${port}${BULL_BOARD_PATH} (principal)`,
  );
  logger.log(
    `📚 Bull Board: http://localhost:${port}${BULL_BOARD_FALLBACK_PATH} (fallback)`,
  );
}

function buildBasicAuthMiddleware(
  expectedUser: string,
  expectedPass: string,
): (request: Request, response: Response, next: NextFunction) => void {
  return (request: Request, response: Response, next: NextFunction): void => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      unauthorized(response);
      return;
    }

    const encodedCredentials = authHeader.slice('Basic '.length).trim();
    let decoded = '';

    try {
      decoded = Buffer.from(encodedCredentials, 'base64').toString('utf8');
    } catch {
      unauthorized(response);
      return;
    }

    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex <= 0) {
      unauthorized(response);
      return;
    }

    const user = decoded.slice(0, separatorIndex);
    const pass = decoded.slice(separatorIndex + 1);

    if (
      !safeEqual(user, expectedUser) ||
      !safeEqual(pass, expectedPass)
    ) {
      unauthorized(response);
      return;
    }

    next();
  };
}

function safeEqual(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  if (valueBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(valueBuffer, expectedBuffer);
}

function unauthorized(response: Response): void {
  response.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
  response.status(401).json({
    statusCode: 401,
    message: 'Não autorizado',
  });
}
