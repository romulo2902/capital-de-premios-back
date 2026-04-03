import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { CreateEdicaoDto } from './create-edicao.dto';

export class CreateEdicaoUploadDto extends OmitType(CreateEdicaoDto, [
  'detalhes',
] as const) {
  @ApiProperty({
    example:
      '[{"origemParticipacao":"DIGITAL","tipoCartela":"UMA_CHANCE","rangeInicio":"1000000","rangeFinal":"1999999"}]',
    description:
      'JSON serializado com o array de detalhes da edição. Use este formato ao enviar `multipart/form-data`.',
  })
  detalhes: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description:
      'Imagem principal da edição. Quando enviada, a API faz upload para o S3 e salva a URL pública em `imagemUrl`.',
  })
  imagem?: unknown;
}

export class UpdateEdicaoUploadDto extends PartialType(CreateEdicaoUploadDto) {}
