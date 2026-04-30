import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

type ErrorMessage = string | string[];
type ErrorData = unknown;

const UNIQUE_FIELD_MESSAGES: Record<string, string> = {
  cpf: 'CPF já cadastrado',
  email: 'Email já cadastrado',
  codigo: 'Código já cadastrado',
  numero: 'Número já cadastrado',
};

const RELATION_FIELD_MESSAGES: Record<string, string> = {
  usuarioId: 'Usuário não encontrado',
  clienteId: 'Cliente não encontrado',
  distribuidorId: 'Distribuidor não encontrado',
  vendedorId: 'Vendedor não encontrado',
  vendaId: 'Venda não encontrada',
  edicaoId: 'Edição não encontrada',
  bilheteId: 'Bilhete não encontrado',
  premioId: 'Prêmio não encontrado',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const { status, message, data } = this.normalizeException(exception, request);
    const stack = this.shouldLogStack(exception, status)
      ? exception.stack
      : undefined;

    this.logger.error(
      `[${request.method}] ${request.url} — ${status}: ${JSON.stringify(message)}`,
      stack,
    );

    response.status(status).json({
      statusCode: status,
      message,
      data: data ?? null,
    });
  }

  private normalizeException(
    exception: unknown,
    request: Request,
  ): { status: number; message: ErrorMessage; data?: ErrorData } {
    if (exception instanceof HttpException) {
      return {
        status: exception.getStatus(),
        message: this.extractHttpExceptionMessage(exception),
        data: this.extractHttpExceptionData(exception),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.mapPrismaKnownRequestError(exception, request);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Dados inválidos para a operação solicitada',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno do servidor',
    };
  }

  private shouldLogStack(
    exception: unknown,
    status: number,
  ): exception is Error {
    if (!(exception instanceof Error)) {
      return false;
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return true;
    }

    return false;
  }

  private extractHttpExceptionMessage(exception: HttpException): ErrorMessage {
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    if (response && typeof response === 'object') {
      const message = (response as Record<string, unknown>).message;
      if (Array.isArray(message)) {
        return message.map((item) => String(item));
      }
      if (typeof message === 'string') {
        return message;
      }
    }

    return exception.message || 'Erro interno do servidor';
  }

  private extractHttpExceptionData(exception: HttpException): ErrorData {
    const response = exception.getResponse();

    if (!response || typeof response !== 'object') {
      return undefined;
    }

    return (response as Record<string, unknown>).data;
  }

  private mapPrismaKnownRequestError(
    exception: Prisma.PrismaClientKnownRequestError,
    request: Request,
  ): { status: number; message: ErrorMessage } {
    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: this.getUniqueConstraintMessage(exception),
        };
      case 'P2003':
        if (request.method === 'DELETE') {
          return {
            status: HttpStatus.CONFLICT,
            message:
              'Não é possível remover o registro porque existem vínculos associados',
          };
        }

        return {
          status: HttpStatus.NOT_FOUND,
          message: this.getForeignKeyConstraintMessage(exception),
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Registro não encontrado',
        };
      default:
        return {
          status: HttpStatus.BAD_REQUEST,
          message:
            'Não foi possível concluir a operação com os dados informados',
        };
    }
  }

  private getUniqueConstraintMessage(
    exception: Prisma.PrismaClientKnownRequestError,
  ): string {
    const fields = this.extractMetaFields(exception.meta);
    const mappedMessage = fields
      .map((field) => UNIQUE_FIELD_MESSAGES[field])
      .find(Boolean);

    return mappedMessage ?? 'Já existe um registro com os dados informados';
  }

  private getForeignKeyConstraintMessage(
    exception: Prisma.PrismaClientKnownRequestError,
  ): string {
    const fields = this.extractMetaFields(exception.meta);
    const mappedMessage = fields
      .map((field) => RELATION_FIELD_MESSAGES[field])
      .find(Boolean);

    return (
      mappedMessage ??
      'Relacionamento informado não encontrado para concluir a operação'
    );
  }

  private extractMetaFields(
    meta: Record<string, unknown> | undefined,
  ): string[] {
    if (!meta) {
      return [];
    }

    const rawValues: string[] = [];

    const target = meta.target;
    if (Array.isArray(target)) {
      rawValues.push(
        ...target.filter((item): item is string => typeof item === 'string'),
      );
    } else if (typeof target === 'string') {
      rawValues.push(target);
    }

    if (typeof meta.constraint === 'string') {
      rawValues.push(meta.constraint);
    }

    if (typeof meta.field_name === 'string') {
      rawValues.push(meta.field_name);
    }

    const fields = rawValues.flatMap((value) => {
      const matches = value.match(/[A-Za-z]+Id|cpf|email|codigo|numero/g);
      return matches ?? [];
    });

    return [...new Set(fields)];
  }
}
