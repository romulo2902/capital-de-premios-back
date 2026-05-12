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

export class InserirResultadoSenaDto {
  @ApiProperty({
    type: [Number],
    example: [4, 17, 23, 38, 51, 60],
    description: '6 números sorteados pela Mega-Sena (1–60, sem repetição)',
  })
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
}
