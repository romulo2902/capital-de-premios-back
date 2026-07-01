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
import {
  parseCombosInput,
  parsePremiosInput,
} from './edicao-input-parsers.util';
import { CreateEdicaoPremioDto } from './create-edicao-premio.dto';

export class UpdateEdicaoDto extends PartialType(CreateEdicaoDto) {
  @ApiPropertyOptional({
    type: [CreateEdicaoComboDto],
    example: [
      {
        origemParticipacao: 'DIGITAL',
        quantidadeCartelas: 1,
        preco: '10.00',
        rangeInicio: '0951000',
        rangeFinal: '0952000',
      },
    ],
    description:
      'Novo conjunto de combos, cada um com preço, origem, quantidade de cartelas e range próprio (rangeInicio/rangeFinal). Quando informado, substitui integralmente os combos existentes.',
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
