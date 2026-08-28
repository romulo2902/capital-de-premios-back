import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { CreateVendedorDto } from '../../vendedores/dto/create-vendedor.dto';

/**
 * Cadastro de vendedor pelo terminal POS.
 *
 * Reaproveita o DTO do painel admin, mas omite `distribuidorId` e `codigo`: a
 * rede vem do token do POS (nunca do corpo da requisição) e o código sequencial
 * é gerado pelo banco.
 */
export class CreatePosVendedorDto extends OmitType(CreateVendedorDto, [
  'distribuidorId',
  'codigo',
  'comissaoPercent',
] as const) {
  @ApiPropertyOptional({
    example: 50,
    description:
      'Porcentagem repassada a este vendedor (0 a 100), referente à fatia que o Distribuidor logado ganha do Admin. Padrão 0.',
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  comissaoPercent?: number;
}
