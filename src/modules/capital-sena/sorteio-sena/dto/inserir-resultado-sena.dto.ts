import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Transform } from 'class-transformer';

const parseNumerosSorteados = ({ value }: { value: unknown }): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === 'string' && item.trim() !== '' ? Number(item) : item,
    );
  }

  if (typeof value !== 'string') {
    return value;
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return value;
  }

  try {
    const parsedValue = JSON.parse(normalizedValue) as unknown;
    if (Array.isArray(parsedValue)) {
      return parsedValue.map((item) =>
        typeof item === 'string' && item.trim() !== '' ? Number(item) : item,
      );
    }
  } catch {
    // Mantém fallback abaixo para formatos simples como "1,2,3,4,5,6".
  }

  if (normalizedValue.includes(',')) {
    return normalizedValue.split(',').map((item) => Number(item.trim()));
  }

  return value;
};

export class InserirResultadoSenaDto {
  @ApiProperty({
    type: [Number],
    example: [4, 17, 23, 38, 51, 60],
    description: '6 números sorteados pela Mega-Sena (1–60, sem repetição)',
  })
  @Transform(parseNumerosSorteados)
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(60, { each: true })
  @ArrayMinSize(6)
  @ArrayMaxSize(6)
  numerosSorteados: number[];

  @ApiPropertyOptional({ example: 'https://cdn.example.com/resultado.png' })
  @IsOptional()
  @IsString()
  imagemResultadoUrl?: string;

  @ApiPropertyOptional({
    example: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...',
    description:
      'Imagem do resultado em base64. Use o padrão data:image/png;base64,... ou data:image/jpeg;base64,...',
  })
  @IsOptional()
  @IsString()
  imagemBase64?: string;
}
