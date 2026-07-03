import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreatePaginaDto {
  @ApiProperty({ example: 'quem-somos', description: 'Slug único da página' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug deve conter apenas letras minúsculas, números e hifens',
  })
  slug: string;

  @ApiProperty({ example: 'Quem Somos', description: 'Título da página' })
  @IsString()
  @IsNotEmpty()
  titulo: string;

  @ApiProperty({ example: '<p>Conteúdo HTML</p>', description: 'Conteúdo da página' })
  @IsString()
  @IsNotEmpty()
  conteudo: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
