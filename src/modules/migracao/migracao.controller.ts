import {
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiBadRequestResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ArquivoXlsxUpload,
  MigracaoService,
  RelatorioImportacao,
} from './migracao.service';
import {
  ImportarXlsxBodyDto,
  ImportarXlsxResponseDto,
} from './dto/importar-xlsx.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Admin / Migração')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/migracao')
export class MigracaoController {
  constructor(private readonly migracaoService: MigracaoService) {}

  @Get()
  @ApiOperation({ summary: 'Listar migrações (ADMIN apenas)' })
  findAll() {
    return this.migracaoService.findAll();
  }

  @Post('importar-xlsx')
  @ApiOperation({
    summary:
      'Importar XLSX de distribuidores, vendedores e clientes com relacionamentos',
    description:
      'Processa planilhas de distribuidores, vendedores e clientes no mesmo arquivo (ou separadas), preservando relacionamentos na ordem: distribuidores -> vendedores -> clientes. Vendedores são vinculados por "Nome Distribuidor" e clientes por "Nome Vendedor".',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ImportarXlsxBodyDto })
  @ApiOkResponse({
    description:
      'Importação finalizada com relatório de criação/atualização/erros por entidade',
    type: ImportarXlsxResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Arquivo ausente, inválido ou incompatível com o layout esperado',
  })
  @UseInterceptors(FileInterceptor('file'))
  importarXlsx(
    @UploadedFile() file: ArquivoXlsxUpload | undefined,
  ): Promise<{ message: string; data: RelatorioImportacao }> {
    return this.migracaoService.importarXlsx(file);
  }
}
