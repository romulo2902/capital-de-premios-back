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

        return {
          statusCode,
          message: data?.message || 'Operação realizada com sucesso',
          data: data?.data !== undefined ? data.data : data,
        };
      }),
    );
  }
}
