import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoBanner } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBannerDto {
  @ApiProperty({
    enum: TipoBanner,
    example: TipoBanner.CDP,
    description: 'Produto onde o banner será exibido.',
  })
  @IsEnum(TipoBanner)
  tipo: TipoBanner;

  @ApiPropertyOptional({
    example: 'Capital de Prêmios',
    description: 'Título opcional do banner para uso no frontend.',
  })
  @IsOptional()
  @IsString()
  titulo?: string;

  @ApiPropertyOptional({
    example: 'Compre agora e concorra aos prêmios da semana.',
    description: 'Descrição opcional do banner.',
  })
  @IsOptional()
  @IsString()
  descricao?: string;

  @ApiProperty({
    example: 'data:image/png;base64,...',
    description:
      'Conteúdo da imagem em base64 (incluindo o prefixo data:image). A API faz upload para o S3.',
  })
  @IsString()
  @IsNotEmpty()
  imagemBase64: string;

  @ApiPropertyOptional({
    example: 'https://loja.capitalpremios.com.br',
    description: 'Link opcional acionado pelo banner.',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  linkUrl?: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Ordem de exibição. Menores valores aparecem primeiro.',
    default: 0,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  ordem?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Define se o banner aparece no cliente.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
