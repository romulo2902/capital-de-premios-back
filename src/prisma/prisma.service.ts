import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AuditAction, Prisma, PrismaClient } from '@prisma/client';
import { getRequestContext } from '../common/request-context/request-context.util';

type AuditActionName =
  | 'create'
  | 'update'
  | 'delete'
  | 'upsert'
  | 'createMany'
  | 'updateMany'
  | 'deleteMany';

type PrismaModelDelegate = {
  findUnique?: (args: Record<string, unknown>) => Promise<unknown>;
  create?: (args: Record<string, unknown>) => Promise<unknown>;
};

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly extendedClient: ReturnType<
    PrismaService['createExtendedClient']
  >;

  constructor() {
    super();

    this.extendedClient = this.createExtendedClient();

    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (
          typeof prop === 'string' &&
          (prop in PrismaService.prototype ||
            prop === 'logger' ||
            prop === 'extendedClient')
        ) {
          return Reflect.get(target, prop, receiver);
        }

        return Reflect.get(
          target.extendedClient as object,
          prop,
          target.extendedClient,
        );
      },
    });
  }

  private createExtendedClient() {
    return this.$extends(
      Prisma.defineExtension((client) =>
        client.$extends({
          query: {
            $allModels: {
              async $allOperations({
                model,
                operation,
                args,
                query,
              }: {
                model?: string;
                operation: string;
                args: Record<string, unknown>;
                query: (args: Record<string, unknown>) => Promise<unknown>;
              }) {
                if (
                  !model ||
                  model === 'AuditLog' ||
                  ![
                    'create',
                    'update',
                    'delete',
                    'upsert',
                    'createMany',
                    'updateMany',
                    'deleteMany',
                  ].includes(operation)
                ) {
                  return query(args);
                }

                const delegate = PrismaService.getDelegate(client, model);
                const before =
                  delegate &&
                  ['update', 'delete', 'upsert'].includes(operation)
                    ? await PrismaService.loadBeforeSnapshot(delegate, args)
                    : null;

                const result = await query(args);

                await client.auditLog.create({
                  data: {
                    requestId: getRequestContext()?.requestId,
                    method: getRequestContext()?.method,
                    path: getRequestContext()?.path,
                    ip: getRequestContext()?.ip,
                    userAgent: getRequestContext()?.userAgent,
                    actorId: getRequestContext()?.user?.id,
                    actorPerfil: getRequestContext()?.user?.perfil,
                    actorEmail: getRequestContext()?.user?.email ?? null,
                    model,
                    action: PrismaService.mapAction(operation as AuditActionName),
                    entityId: PrismaService.extractEntityId(result, before, args),
                    oldData: PrismaService.toAuditJson(before),
                    newData: PrismaService.toAuditJson(
                      PrismaService.extractAfterSnapshot(operation, result),
                    ),
                    metadata: PrismaService.toAuditJson({
                      where: args?.where,
                      data:
                        operation === 'deleteMany' ? undefined : args?.data,
                      count:
                        typeof result === 'object' &&
                        result !== null &&
                        'count' in (result as Record<string, unknown>)
                          ? (result as Record<string, unknown>).count
                          : undefined,
                    }),
                  },
                });

                return result;
              },
            },
          },
        }),
      ),
    );
  }

  async onModuleInit(): Promise<void> {
    await this.extendedClient.$connect();
    this.logger.log('Conexao com o banco inicializada');
  }

  async onModuleDestroy(): Promise<void> {
    await this.extendedClient.$disconnect();
    this.logger.log('Conexao com o banco finalizada');
  }

  private static getDelegate(
    client: object,
    model: string,
  ): PrismaModelDelegate | null {
    const delegateName = model.charAt(0).toLowerCase() + model.slice(1);
    const delegate = (client as unknown as Record<string, unknown>)[delegateName];

    if (!delegate || typeof delegate !== 'object') {
      return null;
    }

    return delegate as PrismaModelDelegate;
  }

  private static async loadBeforeSnapshot(
    delegate: PrismaModelDelegate,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    if (!args?.where || typeof delegate.findUnique !== 'function') {
      return null;
    }

    try {
      return await delegate.findUnique({
        where: args.where as Record<string, unknown>,
      });
    } catch {
      return null;
    }
  }

  private static extractAfterSnapshot(
    action: string,
    result: unknown,
  ): unknown {
    if (['create', 'update', 'upsert'].includes(action)) {
      return result;
    }

    if (action === 'delete') {
      return null;
    }

    return undefined;
  }

  private static extractEntityId(
    result: unknown,
    before: unknown,
    args: Record<string, unknown> | undefined,
  ): string | null {
    const candidates = [
      result as Record<string, unknown> | null,
      before as Record<string, unknown> | null,
      (args?.where as Record<string, unknown> | undefined) ?? null,
    ];

    for (const candidate of candidates) {
      if (candidate && typeof candidate.id === 'string') {
        return candidate.id;
      }
    }

    return null;
  }

  private static mapAction(action: AuditActionName): AuditAction {
    const map: Record<AuditActionName, AuditAction> = {
      create: AuditAction.CREATE,
      update: AuditAction.UPDATE,
      delete: AuditAction.DELETE,
      upsert: AuditAction.UPSERT,
      createMany: AuditAction.CREATE_MANY,
      updateMany: AuditAction.UPDATE_MANY,
      deleteMany: AuditAction.DELETE_MANY,
    };

    return map[action];
  }

  private static toAuditJson(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return Prisma.JsonNull;
    }

    return PrismaService.serializeAuditValue(value) as Prisma.InputJsonValue;
  }

  private static serializeAuditValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value ?? null;
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof Prisma.Decimal) {
      return value.toString();
    }

    if (Array.isArray(value)) {
      return value.map((item) => PrismaService.serializeAuditValue(item));
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !PrismaService.isSensitiveField(key))
        .map(([key, current]) => [key, PrismaService.serializeAuditValue(current)]);

      return Object.fromEntries(entries);
    }

    return value;
  }

  private static isSensitiveField(field: string): boolean {
    return ['senha', 'senhaHash', 'refreshToken', 'token'].includes(field);
  }
}
