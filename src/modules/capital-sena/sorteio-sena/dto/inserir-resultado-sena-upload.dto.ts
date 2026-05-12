import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { InserirResultadoSenaDto } from './inserir-resultado-sena.dto';

/**
 * DTO de upload para o Swagger — estende InserirResultadoSenaDto e adiciona o campo de arquivo.
 * Garante que o campo numerosSorteados apareça junto com o upload da imagem.
 */
export class InserirResultadoSenaUploadDto extends InserirResultadoSenaDto {
  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description:
      'Foto do resultado oficial da Mega-Sena (PNG, JPG, WEBP, max 10MB). ' +
      'Quando enviada, a API faz upload para o S3 e salva a URL pública.',
  })
  imagem?: unknown;
}
