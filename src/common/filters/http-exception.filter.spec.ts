import { ArgumentsHost, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let response: jest.Mocked<Pick<Response, 'status' | 'json'>>;
  let request: Pick<Request, 'method' | 'url'>;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    request = {
      method: 'PATCH',
      url: '/api/admin/clientes/cliente-1',
    };
    host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as ArgumentsHost;
  });

  it('should map Prisma foreign key errors to friendly responses', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      {
        code: 'P2003',
        clientVersion: 'test',
        meta: { constraint: 'Cliente_distribuidorId_fkey' },
      },
    );

    filter.catch(prismaError, host);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'Distribuidor não encontrado',
      data: null,
    });
  });

  it('should preserve handled HttpException messages', () => {
    filter.catch(new NotFoundException('Cliente não encontrado'), host);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'Cliente não encontrado',
      data: null,
      error: 'Not Found',
    });
  });
});
