import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { DestinoEdicao } from '@prisma/client';
import { CreateEdicaoComboDto } from './create-edicao-combo.dto';
import {
  parseCombosInput,
  parsePremiosInput,
} from './edicao-input-parsers.util';
import { CreateEdicaoPremioDto } from './create-edicao-premio.dto';

const parseBooleanInput = ({ value }: TransformFnParams): unknown => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === 'true') {
    return true;
  }

  if (normalizedValue === 'false') {
    return false;
  }

  return value;
};

export class CreateEdicaoDto {
  @ApiProperty({
    example: 'ABC-2026-001',
    description:
      'Identificador de exibição da edição/sorteio (texto livre, não é o ID interno da entidade).',
  })
  @IsString({ message: 'numero deve ser um texto' })
  numero: string;

  @ApiProperty({
    example: '2026-03-27T10:20',
    description:
      'Data e hora do sorteio com precisão de minuto. Aceita `YYYY-MM-DDTHH:mm`, `DD/MM/YYYY HH:mm` ou ISO com fuso e segundos zerados.',
  })
  @IsString({ message: 'dataSorteio deve ser um texto' })
  dataSorteio: string;

  @ApiPropertyOptional({
    example: '2026-03-27T09:59',
    description:
      'Data e hora de encerramento das vendas com precisão de minuto. Se omitida, assume a mesma data/hora do sorteio.',
  })
  @IsOptional()
  @IsString({ message: 'dataEncerramento deve ser um texto' })
  dataEncerramento?: string;

  @ApiPropertyOptional({
    enum: DestinoEdicao,
    example: DestinoEdicao.AMBOS,
    description:
      'Destino da edição/cartela: site, loja física ou ambos. Se omitido, assume SITE.',
  })
  @IsOptional()
  @IsEnum(DestinoEdicao, { message: 'destino deve ser SITE, FISICO ou AMBOS' })
  destino?: DestinoEdicao;

  @ApiProperty({
    example: false,
    description: 'Indica se a cartela possui raspadinha.',
  })
  @Transform(parseBooleanInput)
  @IsBoolean({ message: 'raspadinha deve ser verdadeiro ou falso' })
  raspadinha: boolean;

  @ApiPropertyOptional({
    example: 'Frase do sorteio',
    description: 'Frase exibida na cartela/sorteio no painel administrativo.',
  })
  @IsOptional()
  @IsString({ message: 'frase deve ser um texto' })
  frase?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'Quando ativo, bloqueia todas as vendas da edição em qualquer canal até ser desativado pelo ADMIN.',
  })
  @IsOptional()
  @Transform(parseBooleanInput)
  @IsBoolean({ message: 'manutencaoAtiva deve ser verdadeiro ou falso' })
  manutencaoAtiva?: boolean;

  @ApiPropertyOptional({
    example: 'Vendas temporariamente indisponíveis para manutenção.',
    description:
      'Mensagem exibida ao frontend e retornada nos endpoints de venda bloqueados pela manutenção da edição.',
  })
  @IsOptional()
  @IsString({ message: 'manutencaoMensagem deve ser um texto' })
  manutencaoMensagem?: string;

  @ApiProperty({
    type: [CreateEdicaoComboDto],
    example: [
      {
        origemParticipacao: 'DIGITAL',
        quantidadeCartelas: 1,
        preco: '10.00',
        rangeInicio: '0951000',
        rangeFinal: '0952000',
      },
      {
        origemParticipacao: 'DIGITAL',
        quantidadeCartelas: 2,
        preco: '20.00',
        rangeInicio: '0960000',
        rangeFinal: '0961000',
      },
    ],
    description:
      'Combos da edição com preço, origem, quantidade de cartelas e range próprio (rangeInicio/rangeFinal). Use sempre `quantidadeCartelas` como inteiro entre 1 e 12. Os ranges dos combos não podem se sobrepor entre si.',
  })
  @Transform(parseCombosInput)
  @Type(() => CreateEdicaoComboDto)
  @IsArray({ message: 'combos deve ser um array' })
  @ArrayMinSize(1, { message: 'combos deve ter no mínimo 1 item' })
  @ValidateNested({ each: true })
  combos: CreateEdicaoComboDto[];

  @ApiProperty({
    type: [CreateEdicaoPremioDto],
    description:
      'Prêmios da edição na ordem em que serão sorteados. A API deriva `qtdPremios` a partir deste array.',
  })
  @Transform(parsePremiosInput)
  @Type(() => CreateEdicaoPremioDto)
  @IsArray({ message: 'premios deve ser um array' })
  @ArrayMinSize(1, { message: 'premios deve ter no mínimo 1 item' })
  @ValidateNested({ each: true })
  premios: CreateEdicaoPremioDto[];

  @ApiPropertyOptional({
    example: 'data:image/png;base64,...',
    description:
      'Conteúdo da imagem principal da edição em base64 (incluindo o prefixo data:image).',
  })
  @IsOptional()
  @IsString({ message: 'imagemBase64 deve ser um texto' })
  imagemBase64?: string;
}
