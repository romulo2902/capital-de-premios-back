import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { updateRequestContext } from '../request-context/request-context.util';

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();

    if (request?.user) {
      updateRequestContext({
        user: {
          id: request.user.id,
          perfil: request.user.perfil,
          email: request.user.email ?? null,
        },
      });
    }

    return next.handle();
  }
}
