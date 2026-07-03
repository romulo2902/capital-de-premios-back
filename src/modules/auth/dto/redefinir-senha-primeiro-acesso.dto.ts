import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RedefinirSenhaPrimeiroAcessoDto {
  @ApiProperty({ example: 'vendedor@capitalpremios.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Vend@123' })
  @IsString()
  @IsNotEmpty()
  senhaAtual: string;

  @ApiProperty({ example: 'NovaSenha@123' })
  @IsString()
  @MinLength(8)
  novaSenha: string;
}
