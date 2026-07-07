import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ClientesService } from './clientes.service';
import {
  AtualizarMeusDadosDto,
  BuscarMeusDadosDto,
} from './dto/meus-dados.dto';

@ApiTags('Meus Dados')
@Controller('meus-dados')
export class MeusDadosController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get()
  @ApiOperation({
    summary: 'Buscar dados mascarados do cliente por CPF',
    description:
      'Endpoint público da área do cliente usado tanto no Capital de Prêmios quanto no Capital Sena.',
  })
  @ApiQuery({
    name: 'cpf',
    required: true,
    example: '031.123.456-75',
    description: 'CPF do cliente com ou sem máscara.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Dados do cliente retornados com informações sensíveis mascaradas.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Dados do cliente encontrados',
        data: {
          cliente: {
            id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            nome: 'Tiago Lima',
            cpf: '031.***.***-75',
            cpfMascarado: '031.***.***-75',
            email: 'tia***@hotmail.com',
            emailMascarado: 'tia***@hotmail.com',
            telefone: '(64) 98461-4339',
            dataNascimento: '1990-05-20',
          },
        },
      },
    },
  })
  buscar(@Query() dto: BuscarMeusDadosDto) {
    return this.clientesService.buscarMeusDados(dto.cpf);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar dados do cliente retornado em meus-dados',
  })
  @ApiResponse({
    status: 200,
    description: 'Dados do cliente atualizados e retornados mascarados.',
  })
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarMeusDadosDto,
  ) {
    return this.clientesService.atualizarMeusDados(id, dto);
  }
}
