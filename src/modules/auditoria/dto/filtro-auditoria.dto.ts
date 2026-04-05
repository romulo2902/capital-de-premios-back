import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'UPSERT',
  'CREATE_MANY',
  'UPDATE_MANY',
  'DELETE_MANY',
] as const;

export type AuditActionValue = (typeof AUDIT_ACTIONS)[number];

export class FiltroAuditoriaDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ example: 'Venda' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ enum: AUDIT_ACTIONS, example: 'UPDATE' })
  @IsOptional()
  @IsIn(AUDIT_ACTIONS)
  action?: AuditActionValue;

  @ApiPropertyOptional({ example: 'uuid-do-ator' })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({ example: 'request-id' })
  @IsOptional()
  @IsString()
  requestId?: string;
}
