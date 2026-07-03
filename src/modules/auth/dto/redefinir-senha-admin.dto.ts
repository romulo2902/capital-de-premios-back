import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MinLength } from 'class-validator';

export class RedefinirSenhaAdminDto {
  @ApiProperty({ example: 'c9f61242-97a9-46be-9f43-9f6b7dc44d96' })
  @IsUUID('4')
  @IsNotEmpty()
  usuarioId: string;

  @ApiProperty({ example: 'NovaSenha@123' })
  @IsString()
  @MinLength(8)
  novaSenha: string;
}
