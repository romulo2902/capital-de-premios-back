import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { CreateEdicaoSenaDto } from './create-edicao-sena.dto';
import { UpdateEdicaoSenaDto } from './update-edicao-sena.dto';

/**
 * DTO de upload para o Swagger — estende CreateEdicaoSenaDto e adiciona os campos de arquivo.
 * Garante que todos os campos de texto apareçam no Swagger junto com os uploads.
 *
 * No controller, os campos de texto chegam via @Body() (class CreateEdicaoSenaDto)
 * e os arquivos via @UploadedFiles(). Este DTO é usado APENAS para @ApiBody().
 */
export class CreateEdicaoSenaUploadDto extends OmitType(CreateEdicaoSenaDto, [
  'premios',
  'combos',
] as const) {
  @ApiProperty({
    example:
      '[{"faixa":"QUADRA","descricao":"Quadra — 4 acertos","valor":500},{"faixa":"QUINA","descricao":"Quina — 5 acertos","valor":2000},{"faixa":"SENA","descricao":"Sena — 6 acertos","valor":10000},{"faixa":"SENA_BONUS","descricao":"Sena Bônus — 6 + 7º","valor":50000}]',
    description:
      'JSON serializado com o array de prêmios. Faixas válidas: QUADRA, QUINA, SENA, SENA_BONUS. ' +
      'As imagens de prêmio (premioImagens[]) são associadas na mesma ordem deste array.',
  })
  premios: string;

  @ApiPropertyOptional({
    example:
      '[{"nome":"Combo 3 cartelas","quantidade":3,"preco":15.00},{"nome":"Combo 6 cartelas","quantidade":6,"preco":28.00}]',
    description: 'JSON serializado com os combos da edição (opcional).',
  })
  combos?: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description:
      'Imagem de capa da edição (PNG, JPG, WEBP, max 10MB). ' +
      'Quando enviada, a API faz upload para o S3 e salva a URL pública.',
  })
  imagem?: unknown;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description:
      'Imagens dos prêmios enviadas para o S3 na mesma ordem do array `premios`. ' +
      'A URL pública gerada é salva em `PremioSena.imagemUrl`.',
  })
  premioImagens?: unknown[];
}

export class UpdateEdicaoSenaUploadDto extends OmitType(UpdateEdicaoSenaDto, [
  'premios',
  'combos',
] as const) {
  @ApiPropertyOptional({
    example:
      '[{"faixa":"QUADRA","descricao":"Quadra — 4 acertos","valor":500}]',
    description: 'JSON serializado com o array de prêmios atualizado (substitui todos os anteriores).',
  })
  premios?: string;

  @ApiPropertyOptional({
    example: '[{"nome":"Combo 3","quantidade":3,"preco":15.00}]',
    description: 'JSON serializado com os combos atualizados (substitui todos os anteriores).',
  })
  combos?: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Nova imagem de capa (substitui a atual). Opcional.',
  })
  imagem?: unknown;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Novas imagens de prêmios (na mesma ordem do array `premios`). Opcional.',
  })
  premioImagens?: unknown[];
}
