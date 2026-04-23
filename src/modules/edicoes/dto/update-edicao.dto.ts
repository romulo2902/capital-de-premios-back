import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CreateEdicaoDto } from './create-edicao.dto';
import { CreateEdicaoComboDto } from './create-edicao-combo.dto';
import { CreateEdicaoDetalheDto } from './create-edicao-detalhe.dto';
import {
  parseCombosInput,
  parseDetalhesInput,
  parsePremiosInput,
} from './edicao-input-parsers.util';
import { CreateEdicaoPremioDto } from './create-edicao-premio.dto';

export class UpdateEdicaoDto extends PartialType(CreateEdicaoDto) {
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: {
      type: 'array',
      items: {
        type: 'object',
      },
    },
    example: {
      DIGITAL: [
        {
          indiceRange: 1,
          rangeInicio: '0000001',
          rangeFinal: '0001000',
        },
      ],
      FISICO: [
        {
          indiceRange: 1,
          rangeInicio: '0000001',
          rangeFinal: '0000500',
        },
      ],
    },
    description:
      'Novo conjunto de ranges por setor. Aceita objeto agrupado por `DIGITAL` e `FISICO` ou array plano legado. Quando informado, substitui integralmente os detalhes existentes.',
  })
  @Transform(parseDetalhesInput)
  @Type(() => CreateEdicaoDetalheDto)
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  detalhes?: CreateEdicaoDetalheDto[];

  @ApiPropertyOptional({
    type: [CreateEdicaoComboDto],
    description:
      'Novo conjunto de combos com preços por origem e quantidade de cartelas/chances. Quando informado, substitui integralmente os combos existentes.',
  })
  @Transform(parseCombosInput)
  @Type(() => CreateEdicaoComboDto)
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  combos?: CreateEdicaoComboDto[];

  @ApiPropertyOptional({
    type: [CreateEdicaoPremioDto],
    description:
      'Novo conjunto de prêmios da edição. Quando informado, substitui integralmente os prêmios existentes e recalcula `qtdPremios`.',
  })
  @Transform(parsePremiosInput)
  @Type(() => CreateEdicaoPremioDto)
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  premios?: CreateEdicaoPremioDto[];
}
