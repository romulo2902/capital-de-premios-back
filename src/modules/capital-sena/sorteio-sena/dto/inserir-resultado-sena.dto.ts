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
  @IsArray({ message: 'numerosSorteados deve ser um array' })
  @IsInt({ each: true, message: 'cada número deve ser um inteiro' })
  @Min(1, { each: true, message: 'números devem ser entre 1 e 60' })
  @Max(60, { each: true, message: 'números devem ser entre 1 e 60' })
  @ArrayMinSize(6, { message: 'numerosSorteados deve conter exatamente 6 números' })
  @ArrayMaxSize(6, { message: 'numerosSorteados deve conter exatamente 6 números' })
  numerosSorteados: number[];

  @ApiPropertyOptional({
    example: 38,
    description:
      'Sétima bola sorteada (1–60), usada para apurar o prêmio SENA_BONUS. Deve ser diferente dos 6 números principais.',
  })
  @IsOptional()
  @IsInt({ message: 'setimaBola deve ser um número inteiro' })
  @Min(1, { message: 'setimaBola deve ser entre 1 e 60' })
  @Max(60, { message: 'setimaBola deve ser entre 1 e 60' })
  setimaBola?: number;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/resultado.png',
    description:
      'URL já hospedada da imagem do resultado oficial (alternativa ao envio via imagemBase64).',
  })
  @IsOptional()
  @IsString({ message: 'imagemResultadoUrl deve ser um texto' })
  imagemResultadoUrl?: string;

  @ApiPropertyOptional({
    example: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...',
    description:
      'Imagem do resultado em base64. Use o padrão data:image/png;base64,... ou data:image/jpeg;base64,...',
  })
  @IsOptional()
  @IsString({ message: 'imagemBase64 deve ser um texto' })
  imagemBase64?: string;
}
