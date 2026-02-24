import { PartialType } from '@nestjs/swagger';
import { CreateClienteDto } from './create-cliente.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { StatusUsuario } from '@prisma/client';

export class UpdateClienteDto extends PartialType(CreateClienteDto) {
  @ApiPropertyOptional({ enum: StatusUsuario })
  @IsOptional()
  @IsEnum(StatusUsuario)
  status?: StatusUsuario;
}
