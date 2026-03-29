import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  statusCode: number;
  message: string;
  data: T | null;
  meta?: unknown;
  [key: string]: unknown;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | StreamableFile> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T> | StreamableFile> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();
    const statusCode: number = response.statusCode;

    return next.handle().pipe(
      map((data) => {
        // Arquivos binários (PNG, PDF, XLSX) devem passar sem transformação
        if (data instanceof StreamableFile) return data;

        if (data && typeof data === 'object' && !Array.isArray(data)) {
          const {
            message,
            data: payloadData,
            ...rest
          } = data as Record<string, unknown>;

          return {
            statusCode,
            message:
              typeof message === 'string'
                ? message
                : 'Operação realizada com sucesso',
            data: payloadData !== undefined ? (payloadData as T) : (data as T),
            ...rest,
          };
        }

        return {
          statusCode,
          message: 'Operação realizada com sucesso',
          data,
        };
      }),
    );
  }
}
