import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Validação de maquininha pelo terminal.
 *
 * O terminal só conhece o número de série físico do aparelho — não o UUID
 * interno — então é essa a chave que o operador informa antes de vincular a
 * maquininha à venda.
 */
export class ValidarMaquininhaDto {
  @ApiProperty({
    example: '8012345678',
    description:
      'Número de série impresso no aparelho. Comparado normalizado (sem espaços, caixa alta).',
    minLength: 3,
    maxLength: 60,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  numeroSerie: string;
}
