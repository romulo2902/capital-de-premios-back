import { PartialType } from '@nestjs/swagger';
import { CreateDistribuidorDto } from './create-distribuidor.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { StatusUsuario } from '@prisma/client';

export class UpdateDistribuidorDto extends PartialType(CreateDistribuidorDto) {
  @ApiPropertyOptional({ enum: StatusUsuario })
  @IsOptional()
  @IsEnum(StatusUsuario)
  status?: StatusUsuario;
}
