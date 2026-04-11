import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

const VALOR_PREMIO_REGEX = /^\d+([.,]\d{1,2})?$/;

export class CreateEdicaoPremioDto {
  @ApiProperty({
    example: '1º Prêmio - Moto 0km',
    description: 'Descrição exibida para o prêmio na edição.',
  })
  @IsString()
  @IsNotEmpty()
  descricao: string;

  @ApiProperty({
    example: '25000.00',
    description:
      'Valor monetário do prêmio. Aceita ponto ou vírgula como separador decimal.',
  })
  @IsString()
  @Matches(VALOR_PREMIO_REGEX, {
    message: 'valor deve ser um valor monetário válido',
  })
  valor: string;
}
