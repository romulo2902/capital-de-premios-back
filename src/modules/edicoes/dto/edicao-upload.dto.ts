import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { CreateEdicaoDto } from './create-edicao.dto';

export class CreateEdicaoUploadDto extends OmitType(CreateEdicaoDto, [
  'detalhes',
  'combos',
  'premios',
] as const) {
  @ApiProperty({
    example:
      '{"DIGITAL":[{"indiceRange":1,"rangeInicio":"0000001","rangeFinal":"0001000"},{"indiceRange":2,"rangeInicio":"0001001","rangeFinal":"0002000"},{"indiceRange":3,"rangeInicio":"0002001","rangeFinal":"0003000"}],"FISICO":[{"indiceRange":1,"rangeInicio":"0000001","rangeFinal":"0000500"},{"indiceRange":2,"rangeInicio":"0000501","rangeFinal":"0001000"}]}',
    description:
      'JSON serializado com os ranges por setor da edição, agrupados por `DIGITAL` e `FISICO`. Cada item é um setor individual com seu próprio range.',
  })
  detalhes: string;

  @ApiProperty({
    example:
      '[{"origemParticipacao":"DIGITAL","quantidadeCartelas":1,"preco":"10.00"},{"origemParticipacao":"DIGITAL","quantidadeCartelas":2,"preco":"20.00"},{"origemParticipacao":"POS","quantidadeCartelas":2,"preco":"22.00"}]',
    description:
      'JSON serializado com os combos da edição e seus preços por origem e quantidade de cartelas.',
  })
  combos: string;

  @ApiProperty({
    example:
      '[{"descricao":"1º Prêmio - Moto 0km","valor":"25000.00"},{"descricao":"2º Prêmio - Smart TV","valor":"3500.00"}]',
    description:
      'JSON serializado com o array de prêmios da edição, na ordem do sorteio. Quando `premioImagens` for enviado, os arquivos são associados a este array pela mesma ordem.',
  })
  premios: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description:
      'Imagem principal da edição. Quando enviada, a API faz upload para o S3 e salva a URL pública em `imagemUrl` internamente.',
  })
  imagem?: unknown;

  @ApiPropertyOptional({
    type: 'array',
    items: {
      type: 'string',
      format: 'binary',
    },
    description:
      'Imagens dos prêmios enviadas para a S3 na mesma ordem do array `premios`. A URL pública gerada é salva em `Premio.imagemUrl`.',
  })
  premioImagens?: unknown[];
}

export class UpdateEdicaoUploadDto extends PartialType(CreateEdicaoUploadDto) {}
