import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { StatusMaquininha } from '@prisma/client';
import { CreateMaquininhaDto } from './create-maquininha.dto';

export class UpdateMaquininhaDto extends PartialType(CreateMaquininhaDto) {
  @ApiPropertyOptional({
    enum: StatusMaquininha,
    example: StatusMaquininha.ATIVA,
    description:
      'Situação do aparelho. Uma maquininha INATIVA não pode ser usada em novas vendas do POS.',
  })
  @IsOptional()
  @IsEnum(StatusMaquininha)
  status?: StatusMaquininha;
}
