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
      '[{"origemParticipacao":"DIGITAL","tipoCartela":"DUAS_CHANCES","preco":"20.00","chances":[{"indiceChance":1,"rangeInicio":"0950000","rangeFinal":"0999980"},{"indiceChance":2,"rangeInicio":"1950000","rangeFinal":"1999980"}]},{"origemParticipacao":"DIGITAL","tipoCartela":"SEIS_CHANCES","preco":"30.00","chances":[{"indiceChance":1,"rangeInicio":"0276531","rangeFinal":"0286521"},{"indiceChance":2,"rangeInicio":"0376531","rangeFinal":"0386521"},{"indiceChance":3,"rangeInicio":"0476531","rangeFinal":"0486521"},{"indiceChance":4,"rangeInicio":"0576531","rangeFinal":"0586521"},{"indiceChance":5,"rangeInicio":"0676531","rangeFinal":"0686521"},{"indiceChance":6,"rangeInicio":"0776531","rangeFinal":"0786521"}]},{"origemParticipacao":"DIGITAL","tipoCartela":"DOZE_CHANCES","preco":"50.00","chances":[{"indiceChance":1,"rangeInicio":"0851903","rangeFinal":"0861893"},{"indiceChance":2,"rangeInicio":"0921903","rangeFinal":"0931893"},{"indiceChance":3,"rangeInicio":"0991903","rangeFinal":"1001893"},{"indiceChance":4,"rangeInicio":"1061903","rangeFinal":"1071893"},{"indiceChance":5,"rangeInicio":"1131903","rangeFinal":"1141893"},{"indiceChance":6,"rangeInicio":"1201903","rangeFinal":"1211893"},{"indiceChance":7,"rangeInicio":"1271903","rangeFinal":"1281893"},{"indiceChance":8,"rangeInicio":"1341903","rangeFinal":"1351893"},{"indiceChance":9,"rangeInicio":"1411903","rangeFinal":"1421893"},{"indiceChance":10,"rangeInicio":"1481903","rangeFinal":"1491893"},{"indiceChance":11,"rangeInicio":"1551903","rangeFinal":"1561893"},{"indiceChance":12,"rangeInicio":"1621903","rangeFinal":"1631893"}]}]',
    description:
      'JSON serializado com array de grupos (por `origemParticipacao` + `tipoCartela`). Cada grupo contém `chances` (1 item por bilhete) com ranges do mesmo tamanho para manter o pareamento. `preco` é por combo (2/6/12) e não por bilhete.',
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
