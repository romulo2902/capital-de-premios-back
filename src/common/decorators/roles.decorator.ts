import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
// Using string[] instead of Prisma enum to avoid import issues before prisma generate
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
