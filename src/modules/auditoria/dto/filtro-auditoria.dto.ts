import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

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

export class FiltroAuditoriaDto extends PaginationQueryDto {
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
