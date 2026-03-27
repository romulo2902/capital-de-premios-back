import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateEdicaoDto } from './create-edicao.dto';
import { CreateEdicaoDetalheDto } from './create-edicao-detalhe.dto';

export class UpdateEdicaoDto extends PartialType(CreateEdicaoDto) {
  @ApiPropertyOptional({
    type: [CreateEdicaoDetalheDto],
    description:
      'Novo conjunto de detalhes/ranges da edição. Quando informado, substitui integralmente os detalhes existentes.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateEdicaoDetalheDto)
  detalhes?: CreateEdicaoDetalheDto[];
}
