import { ApiProperty } from '@nestjs/swagger';

export class ImportarXlsxBodyDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description:
      'Arquivo XLSX contendo planilhas de distribuidores, vendedores e/ou clientes',
  })
  file!: unknown;
}

export class ContagemImportacaoDto {
  @ApiProperty({ example: 120 })
  lidos!: number;

  @ApiProperty({ example: 95 })
  criados!: number;

  @ApiProperty({ example: 20 })
  atualizados!: number;

  @ApiProperty({ example: 3 })
  ignorados!: number;

  @ApiProperty({ example: 2 })
  erros!: number;
}

export class RelatorioImportacaoDto {
  @ApiProperty({ type: ContagemImportacaoDto })
  distribuidores!: ContagemImportacaoDto;

  @ApiProperty({ type: ContagemImportacaoDto })
  vendedores!: ContagemImportacaoDto;

  @ApiProperty({ type: ContagemImportacaoDto })
  clientes!: ContagemImportacaoDto;

  @ApiProperty({
    type: [String],
    example: ['[Sheet1 linha 10] Vendedor não encontrado para "Fulano"'],
  })
  erros!: string[];
}

export class ImportarXlsxResponseDto {
  @ApiProperty({ example: 'Importação XLSX concluída' })
  message!: string;

  @ApiProperty({ type: RelatorioImportacaoDto })
  data!: RelatorioImportacaoDto;
}
