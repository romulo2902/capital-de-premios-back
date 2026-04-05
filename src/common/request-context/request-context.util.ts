import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextUser {
  id: string;
  perfil: string;
  email?: string | null;
}

export interface RequestContextData {
  requestId: string;
  method?: string;
  path?: string;
  ip?: string;
  userAgent?: string;
  user?: RequestContextUser;
}

const requestContextStorage = new AsyncLocalStorage<RequestContextData>();

export function runWithRequestContext<T>(
  context: RequestContextData,
  callback: () => T,
): T {
  return requestContextStorage.run(context, callback);
}

export function getRequestContext(): RequestContextData | undefined {
  return requestContextStorage.getStore();
}

export function updateRequestContext(
  partial: Partial<RequestContextData>,
): void {
  const context = requestContextStorage.getStore();

  if (!context) {
    return;
  }

  Object.assign(context, partial);
}
