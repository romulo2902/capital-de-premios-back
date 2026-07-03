import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsUUID, ArrayMinSize } from 'class-validator';

export class ReservarCartelasDto {
  @ApiProperty({ example: 'uuid-da-edicao', description: 'ID da edição' })
  @IsUUID('4')
  edicaoId: string;

  @ApiProperty({
    type: [String],
    description: 'Lista de números absolutos das cartelas selecionadas para reserva',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  cartelas: string[];
}
