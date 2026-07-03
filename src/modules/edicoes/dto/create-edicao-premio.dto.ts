import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

const VALOR_PREMIO_REGEX = /^\d+([.,]\d{1,2})?$/;

export class CreateEdicaoPremioDto {
  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description:
      'ID do prêmio existente. Se enviado no PATCH, a API atualiza o registro correspondente. Se omitido, trata como um novo prêmio na ordem do array.',
  })
  @IsOptional()
  @IsString({ message: 'id deve ser um texto' })
  id?: string;

  @ApiProperty({
    example: '1º Prêmio - Moto 0km',
    description: 'Descrição exibida para o prêmio na edição.',
  })
  @IsString({ message: 'descricao deve ser um texto' })
  @IsNotEmpty({ message: 'descricao não pode ser vazio' })
  descricao: string;

  @ApiProperty({
    example: '25000.00',
    description:
      'Valor monetário do prêmio. Aceita ponto ou vírgula como separador decimal.',
  })
  @IsString({ message: 'valor deve ser um texto' })
  @Matches(VALOR_PREMIO_REGEX, {
    message: 'valor deve ser um valor monetário válido',
  })
  valor: string;

  @ApiPropertyOptional({
    example:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    description:
      'Conteúdo da imagem em base64 (incluindo o prefixo data:image). Se enviado, a API faz o upload para o S3.',
  })
  @IsOptional()
  @IsString({ message: 'imagemBase64 deve ser um texto' })
  imagemBase64?: string;
}
