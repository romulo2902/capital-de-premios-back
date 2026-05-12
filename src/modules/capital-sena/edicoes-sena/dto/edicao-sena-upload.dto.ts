import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO de upload para o Swagger — usado apenas para documentação dos campos de arquivo.
 * Os campos de texto são validados pelo CreateEdicaoSenaDto via @Body().
 */
export class CreateEdicaoSenaUploadDto {
  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Imagem de capa da edição (PNG, JPG, WEBP, max 10MB)',
  })
  imagem?: Express.Multer.File;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description:
      'Imagens dos prêmios por faixa. Ordem: QUADRA, QUINA, SENA, SENA_BONUS (mesma ordem do array "premios")',
  })
  premioImagens?: Express.Multer.File[];
}

export class UpdateEdicaoSenaUploadDto {
  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Nova imagem de capa da edição',
  })
  imagem?: Express.Multer.File;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Novas imagens dos prêmios (mesma ordem do array "premios")',
  })
  premioImagens?: Express.Multer.File[];
}
