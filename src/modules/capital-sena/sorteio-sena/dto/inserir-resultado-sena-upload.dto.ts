import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class InserirResultadoSenaUploadDto {
  @ApiProperty({
    type: [Number],
    example: [4, 17, 23, 38, 51, 60],
    description: '6 números sorteados pela Mega-Sena (1–60, sem repetição)',
  })
  numerosSorteados: number[];

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Imagem do resultado oficial da Mega-Sena (PNG, JPG, WEBP, max 10MB)',
  })
  imagem?: Express.Multer.File;
}
