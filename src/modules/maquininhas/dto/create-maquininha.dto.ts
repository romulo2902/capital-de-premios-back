import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateMaquininhaDto {
  @ApiProperty({
    example: '8012345678',
    description:
      'Número de série impresso no aparelho. Identificador único global — um mesmo aparelho não pode estar em duas redes.',
    minLength: 3,
    maxLength: 60,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  numeroSerie: string;

  @ApiPropertyOptional({
    example: 'Maquininha do balcão',
    description: 'Nome amigável para identificar o aparelho no terminal.',
    maxLength: 60,
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  apelido?: string;

  @ApiPropertyOptional({
    example: 'PagBank',
    description:
      'Adquirente do aparelho (PagBank, Stone, Cielo, Rede, Mercado Pago...). Texto livre.',
    maxLength: 40,
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  operadora?: string;

  @ApiPropertyOptional({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description:
      'Vendedor que opera este aparelho. Precisa ser da mesma rede. Omitido, a maquininha fica no estoque do distribuidor.',
  })
  @IsOptional()
  @IsUUID('4')
  vendedorId?: string;

  @ApiPropertyOptional({
    example: 'b2c3d4e5-f6a7-8901-bcde-f23456789012',
    description:
      'Rede dona do aparelho. Obrigatório para ADMIN. Ignorado para DISTRIBUIDOR — nesse caso a rede vem do token.',
  })
  @IsOptional()
  @IsUUID('4')
  distribuidorId?: string;
}
