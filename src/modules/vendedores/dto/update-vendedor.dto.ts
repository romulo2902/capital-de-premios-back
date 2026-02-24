import { PartialType } from '@nestjs/swagger';
import { CreateVendedorDto } from './create-vendedor.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { StatusUsuario } from '@prisma/client';

export class UpdateVendedorDto extends PartialType(CreateVendedorDto) {
  @ApiPropertyOptional({ enum: StatusUsuario })
  @IsOptional()
  @IsEnum(StatusUsuario)
  status?: StatusUsuario;
}
