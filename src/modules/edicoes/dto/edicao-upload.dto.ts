import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { CreateEdicaoDto } from './create-edicao.dto';

export class CreateEdicaoUploadDto extends OmitType(CreateEdicaoDto, [
  'detalhes',
  'premios',
] as const) {
  @ApiProperty({
    example:
      '[{"origemParticipacao":"DIGITAL","tipoCartela":"UMA_CHANCE","rangeInicio":"1000000","rangeFinal":"1999999"}]',
    description:
      'JSON serializado com o array de detalhes da edição. Cada detalhe representa o intervalo total do combo dentro da matriz. Use este formato ao enviar `multipart/form-data`.',
  })
  detalhes: string;

  @ApiProperty({
    example:
      '[{"descricao":"1º Prêmio - Moto 0km","valor":"25000.00"},{"descricao":"2º Prêmio - Smart TV","valor":"3500.00"}]',
    description:
      'JSON serializado com o array de prêmios da edição, na ordem do sorteio. Use este formato ao enviar `multipart/form-data`.',
  })
  premios: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description:
      'Imagem principal da edição. Quando enviada, a API faz upload para o S3 e salva a URL pública em `imagemUrl` internamente.',
  })
  imagem?: unknown;
}

export class UpdateEdicaoUploadDto extends PartialType(CreateEdicaoUploadDto) {}
