import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import { Perfil, Prisma, StatusUsuario } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';

type TipoPlanilha =
  | 'DISTRIBUIDORES'
  | 'VENDEDORES'
  | 'CLIENTES'
  | 'DESCONHECIDA';

interface ContagemImportacao {
  lidos: number;
  criados: number;
  atualizados: number;
  ignorados: number;
  erros: number;
}

interface LinhaVendedorImportacao {
  rowNumber: number;
  codigo: number | null;
  nome: string;
  cpf: string;
  telefone: string | null;
  dataNascimento: Date | undefined;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  cidade: string | null;
  bairro: string | null;
  estado: string | null;
  email: string;
  distribuidorId: string;
}

export interface RelatorioImportacao {
  distribuidores: ContagemImportacao;
  vendedores: ContagemImportacao;
  clientes: ContagemImportacao;
  erros: string[];
}

export interface ArquivoXlsxUpload {
  buffer: Uint8Array;
  originalname?: string;
  mimetype?: string;
  size?: number;
}

@Injectable()
export class MigracaoService {
  private readonly logger = new Logger(MigracaoService.name);
  private readonly senhaDistribuidorDefault = 'Dist@123';
  private readonly senhaVendedorDefault = 'Vend@123';

  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    this.logger.log('Listando migracao');
    return {
      message: 'Módulo de migração ativo',
      data: {
        endpoints: ['POST /admin/migracao/importar-xlsx'],
      },
    };
  }

  async importarXlsx(
    file: ArquivoXlsxUpload | undefined,
  ): Promise<{ message: string; data: RelatorioImportacao }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Arquivo XLSX não enviado');
    }

    const workbook = new ExcelJS.Workbook();
    const arquivoTemporario = join('/tmp', `migracao-${randomUUID()}.xlsx`);
    try {
      await fs.writeFile(arquivoTemporario, file.buffer);
      await workbook.xlsx.readFile(arquivoTemporario);
    } catch {
      throw new BadRequestException('Arquivo inválido. Envie um XLSX válido');
    } finally {
      await fs.unlink(arquivoTemporario).catch(() => undefined);
    }

    if (!workbook.worksheets.length) {
      throw new BadRequestException('Arquivo XLSX sem planilhas');
    }

    const relatorio: RelatorioImportacao = {
      distribuidores: this.novaContagem(),
      vendedores: this.novaContagem(),
      clientes: this.novaContagem(),
      erros: [],
    };

    const planilhasPorTipo = {
      DISTRIBUIDORES: [] as ExcelJS.Worksheet[],
      VENDEDORES: [] as ExcelJS.Worksheet[],
      CLIENTES: [] as ExcelJS.Worksheet[],
      DESCONHECIDA: [] as ExcelJS.Worksheet[],
    };

    for (const worksheet of workbook.worksheets) {
      const tipo = this.identificarTipoPlanilha(worksheet);
      planilhasPorTipo[tipo].push(worksheet);
    }

    for (const ws of planilhasPorTipo.DESCONHECIDA) {
      relatorio.erros.push(
        `Planilha "${ws.name}" ignorada: tipo não identificado`,
      );
    }

    for (const worksheet of planilhasPorTipo.DISTRIBUIDORES) {
      await this.importarDistribuidores(worksheet, relatorio);
    }

    for (const worksheet of planilhasPorTipo.VENDEDORES) {
      await this.importarVendedores(worksheet, relatorio);
    }

    for (const worksheet of planilhasPorTipo.CLIENTES) {
      await this.importarClientes(worksheet, relatorio);
    }

    this.logger.log(
      `Importação concluída. Dist c:${relatorio.distribuidores.criados} u:${relatorio.distribuidores.atualizados}; ` +
        `Vend c:${relatorio.vendedores.criados} u:${relatorio.vendedores.atualizados}; ` +
        `Cli c:${relatorio.clientes.criados} u:${relatorio.clientes.atualizados}`,
    );

    return {
      message: 'Importação XLSX concluída',
      data: relatorio,
    };
  }

  private async importarDistribuidores(
    worksheet: ExcelJS.Worksheet,
    relatorio: RelatorioImportacao,
  ): Promise<void> {
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      if (!row.hasValues) continue;

      relatorio.distribuidores.lidos += 1;

      const nome = this.texto(row.getCell(3).value);
      const cpf = this.cpf(row.getCell(4).value);
      const email = this.email(row.getCell(13).value);

      if (!nome || !cpf || !email) {
        relatorio.distribuidores.ignorados += 1;
        relatorio.erros.push(
          `[${worksheet.name} linha ${rowNumber}] Distribuidor ignorado: nome/cpf/email obrigatórios`,
        );
        continue;
      }

      try {
        const codigo = await this.resolverCodigoDistribuidor(
          this.numero(row.getCell(1).value),
        );
        const existente = await this.prisma.distribuidor.findUnique({
          where: { cpf },
        });

        if (existente) {
          await this.prisma.distribuidor.update({
            where: { id: existente.id },
            data: {
              nome,
              telefone: this.texto(row.getCell(5).value) ?? undefined,
              dataNascimento: this.data(row.getCell(6).value),
              cep: this.texto(row.getCell(7).value),
              endereco: this.texto(row.getCell(8).value),
              numero: this.texto(row.getCell(9).value),
              cidade: this.texto(row.getCell(10).value),
              bairro: this.texto(row.getCell(11).value),
              estado: this.texto(row.getCell(12).value),
              email,
            },
          });

          await this.prisma.usuario.update({
            where: { id: existente.usuarioId },
            data: { cpf, email, perfil: Perfil.DISTRIBUIDOR },
          });

          relatorio.distribuidores.atualizados += 1;
          continue;
        }

        await this.prisma.$transaction(async (tx) => {
          const usuario = await this.obterOuCriarUsuario(tx, {
            cpf,
            email,
            perfil: Perfil.DISTRIBUIDOR,
            senhaPadrao: this.senhaDistribuidorDefault,
          });

          await tx.distribuidor.create({
            data: {
              ...(codigo ? { codigo } : {}),
              usuarioId: usuario.id,
              nome,
              cpf,
              telefone: this.texto(row.getCell(5).value) ?? '',
              dataNascimento: this.data(row.getCell(6).value),
              cep: this.texto(row.getCell(7).value),
              endereco: this.texto(row.getCell(8).value),
              numero: this.texto(row.getCell(9).value),
              cidade: this.texto(row.getCell(10).value),
              bairro: this.texto(row.getCell(11).value),
              estado: this.texto(row.getCell(12).value),
              email,
              status: StatusUsuario.ATIVO,
            },
          });
        });

        relatorio.distribuidores.criados += 1;
      } catch (error) {
        relatorio.distribuidores.erros += 1;
        relatorio.erros.push(
          `[${worksheet.name} linha ${rowNumber}] Falha ao importar distribuidor CPF ${cpf}: ${(error as Error).message}`,
        );
      }
    }
  }

  private async importarVendedores(
    worksheet: ExcelJS.Worksheet,
    relatorio: RelatorioImportacao,
  ): Promise<void> {
    const distribuidores = await this.prisma.distribuidor.findMany({
      select: { id: true, nome: true },
    });
    const distPorNome = this.mapearPorNome(distribuidores);
    const linhas: LinhaVendedorImportacao[] = [];
    const cpfsVistos = new Set<string>();

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      if (!row.hasValues) continue;

      relatorio.vendedores.lidos += 1;

      const nome = this.texto(row.getCell(3).value);
      const cpf = this.cpf(row.getCell(4).value);
      const camposFim = [13, 14, 15, 16].map((c) =>
        this.texto(row.getCell(c).value),
      );
      const emailEncontrado =
        camposFim
          .map((valor) => (valor ? this.email(valor) : null))
          .find((valor): valor is string => Boolean(valor)) ?? null;
      const email = emailEncontrado ?? (cpf ? `${cpf}@importacao.local` : null);
      const nomeDistribuidor = this.extrairNomeRelacionamento(camposFim);

      if (!nome || !cpf || !nomeDistribuidor) {
        const camposFaltantes: string[] = [];
        if (!nome) camposFaltantes.push('nome');
        if (!cpf) camposFaltantes.push('cpf');
        if (!nomeDistribuidor) camposFaltantes.push('distribuidor');

        relatorio.vendedores.ignorados += 1;
        relatorio.erros.push(
          `[${worksheet.name} linha ${rowNumber}] Vendedor ignorado: campos obrigatórios ausentes (${camposFaltantes.join(', ')})`,
        );
        continue;
      }

      const distribuidorId = this.buscarRelacionamentoPorNome(
        nomeDistribuidor,
        distPorNome,
      );
      if (!distribuidorId) {
        relatorio.vendedores.ignorados += 1;
        relatorio.erros.push(
          `[${worksheet.name} linha ${rowNumber}] Distribuidor não encontrado para "${nomeDistribuidor}"`,
        );
        continue;
      }

      if (cpfsVistos.has(cpf)) {
        relatorio.vendedores.ignorados += 1;
        relatorio.erros.push(
          `[${worksheet.name} linha ${rowNumber}] Vendedor ignorado: CPF duplicado no arquivo (${cpf})`,
        );
        continue;
      }
      cpfsVistos.add(cpf);

      linhas.push({
        rowNumber,
        codigo: this.numero(row.getCell(1).value),
        nome,
        cpf,
        telefone: this.texto(row.getCell(5).value),
        dataNascimento: this.data(row.getCell(6).value),
        cep: this.texto(row.getCell(7).value),
        endereco: this.texto(row.getCell(8).value),
        numero: this.texto(row.getCell(9).value),
        cidade: this.texto(row.getCell(10).value),
        bairro: this.texto(row.getCell(11).value),
        estado: this.texto(row.getCell(12).value),
        email: email ?? `${cpf}@importacao.local`,
        distribuidorId,
      });
    }

    if (!linhas.length) return;

    const cpfs = linhas.map((item) => item.cpf);
    const emails = linhas.map((item) => item.email);
    const codigos = linhas
      .map((item) => item.codigo)
      .filter((codigo): codigo is number => codigo !== null);

    const [vendedoresExistentes, usuariosExistentes, codigosOcupados] =
      await Promise.all([
        this.prisma.vendedor.findMany({
          where: { cpf: { in: cpfs } },
          select: { id: true, cpf: true, usuarioId: true },
        }),
        this.prisma.usuario.findMany({
          where: {
            OR: [{ cpf: { in: cpfs } }, { email: { in: emails } }],
          },
          select: {
            id: true,
            cpf: true,
            email: true,
            perfil: true,
            senhaHash: true,
          },
        }),
        codigos.length
          ? this.prisma.vendedor.findMany({
              where: { codigo: { in: codigos } },
              select: { codigo: true },
            })
          : Promise.resolve([]),
      ]);
    const vendedoresPorUsuariosExistentes = usuariosExistentes.length
      ? await this.prisma.vendedor.findMany({
          where: {
            usuarioId: { in: usuariosExistentes.map((item) => item.id) },
          },
          select: { id: true, cpf: true, usuarioId: true },
        })
      : [];

    const vendedorPorCpf = new Map(
      vendedoresExistentes.map((item) => [item.cpf, item]),
    );
    const vendedorPorUsuarioId = new Map(
      vendedoresExistentes.map((item) => [item.usuarioId, item]),
    );
    for (const item of vendedoresPorUsuariosExistentes) {
      vendedorPorUsuarioId.set(item.usuarioId, item);
      vendedorPorCpf.set(item.cpf, item);
    }
    const usuarioPorCpf = new Map(
      usuariosExistentes
        .filter((item) => Boolean(item.cpf))
        .map((item) => [item.cpf as string, item]),
    );
    const usuarioPorEmail = new Map(
      usuariosExistentes
        .filter((item) => Boolean(item.email))
        .map((item) => [item.email as string, item]),
    );
    const codigosReservados = new Set<number>(
      codigosOcupados.map((item) => item.codigo),
    );
    const usuarioIdsParaCriacaoVendedor = new Set<string>();

    const senhaVendedorHash = await bcrypt.hash(this.senhaVendedorDefault, 10);
    const usuariosParaCriar: Prisma.UsuarioCreateManyInput[] = [];
    const vendedoresParaCriar: Prisma.VendedorCreateManyInput[] = [];
    const vendedoresParaAtualizar: Array<{
      linha: number;
      cpf: string;
      id: string;
      data: Prisma.VendedorUncheckedUpdateInput;
    }> = [];
    const usuariosParaAtualizar = new Map<string, Prisma.UsuarioUpdateInput>();

    for (const linha of linhas) {
      const vendedorExistente = vendedorPorCpf.get(linha.cpf);
      if (vendedorExistente) {
        vendedoresParaAtualizar.push({
          linha: linha.rowNumber,
          cpf: linha.cpf,
          id: vendedorExistente.id,
          data: {
            distribuidorId: linha.distribuidorId,
            nome: linha.nome,
            telefone: linha.telefone ?? undefined,
            dataNascimento: linha.dataNascimento,
            cep: linha.cep,
            endereco: linha.endereco,
            numero: linha.numero,
            cidade: linha.cidade,
            bairro: linha.bairro,
            estado: linha.estado,
            email: linha.email,
            nomeRecebedor: linha.nome,
          },
        });

        usuariosParaAtualizar.set(vendedorExistente.usuarioId, {
          cpf: linha.cpf,
          email: linha.email,
          perfil: Perfil.VENDEDOR,
          status: StatusUsuario.ATIVO,
        });
        continue;
      }

      const usuarioExistente =
        usuarioPorCpf.get(linha.cpf) ?? usuarioPorEmail.get(linha.email);
      if (usuarioExistente && usuarioExistente.perfil !== Perfil.VENDEDOR) {
        relatorio.vendedores.ignorados += 1;
        relatorio.erros.push(
          `[${worksheet.name} linha ${linha.rowNumber}] Usuário ${linha.cpf} já existe com perfil ${usuarioExistente.perfil}`,
        );
        continue;
      }

      let usuarioId: string;
      if (usuarioExistente) {
        usuarioId = usuarioExistente.id;
        const vendedorDoUsuario = vendedorPorUsuarioId.get(usuarioId);
        if (vendedorDoUsuario) {
          vendedoresParaAtualizar.push({
            linha: linha.rowNumber,
            cpf: linha.cpf,
            id: vendedorDoUsuario.id,
            data: {
              distribuidorId: linha.distribuidorId,
              nome: linha.nome,
              cpf: linha.cpf,
              telefone: linha.telefone ?? undefined,
              dataNascimento: linha.dataNascimento,
              cep: linha.cep,
              endereco: linha.endereco,
              numero: linha.numero,
              cidade: linha.cidade,
              bairro: linha.bairro,
              estado: linha.estado,
              email: linha.email,
              nomeRecebedor: linha.nome,
            },
          });

          usuariosParaAtualizar.set(usuarioId, {
            cpf: linha.cpf,
            email: linha.email,
            perfil: Perfil.VENDEDOR,
            status: StatusUsuario.ATIVO,
            ...(usuarioExistente.senhaHash
              ? {}
              : { senhaHash: senhaVendedorHash }),
          });
          continue;
        }

        if (usuarioIdsParaCriacaoVendedor.has(usuarioId)) {
          relatorio.vendedores.ignorados += 1;
          relatorio.erros.push(
            `[${worksheet.name} linha ${linha.rowNumber}] Vendedor ignorado: usuário já associado em outra linha do arquivo (${usuarioId})`,
          );
          continue;
        }
        usuarioIdsParaCriacaoVendedor.add(usuarioId);

        usuariosParaAtualizar.set(usuarioId, {
          cpf: linha.cpf,
          email: linha.email,
          perfil: Perfil.VENDEDOR,
          status: StatusUsuario.ATIVO,
          ...(usuarioExistente.senhaHash
            ? {}
            : { senhaHash: senhaVendedorHash }),
        });
      } else {
        usuarioId = randomUUID();
        usuariosParaCriar.push({
          id: usuarioId,
          cpf: linha.cpf,
          email: linha.email,
          senhaHash: senhaVendedorHash,
          perfil: Perfil.VENDEDOR,
          status: StatusUsuario.ATIVO,
        });

        const novoUsuario = {
          id: usuarioId,
          cpf: linha.cpf,
          email: linha.email,
          perfil: Perfil.VENDEDOR,
          senhaHash: senhaVendedorHash,
        };
        usuarioPorCpf.set(linha.cpf, novoUsuario);
        usuarioPorEmail.set(linha.email, novoUsuario);
      }

      const codigo =
        linha.codigo && !codigosReservados.has(linha.codigo)
          ? linha.codigo
          : null;
      if (codigo) codigosReservados.add(codigo);

      vendedoresParaCriar.push({
        ...(codigo ? { codigo } : {}),
        usuarioId,
        distribuidorId: linha.distribuidorId,
        nome: linha.nome,
        cpf: linha.cpf,
        nomeRecebedor: linha.nome,
        telefone: linha.telefone ?? '',
        dataNascimento: linha.dataNascimento,
        cep: linha.cep,
        endereco: linha.endereco,
        numero: linha.numero,
        cidade: linha.cidade,
        bairro: linha.bairro,
        estado: linha.estado,
        email: linha.email,
        status: StatusUsuario.ATIVO,
      });
    }

    if (usuariosParaCriar.length || vendedoresParaCriar.length) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `SELECT setval(
              pg_get_serial_sequence('"Vendedor"', 'codigo'),
              COALESCE((SELECT MAX("codigo") FROM "Vendedor"), 1),
              true
            )`,
          );
          if (usuariosParaCriar.length) {
            for (const lote of this.quebrarEmLotes(usuariosParaCriar, 500)) {
              await tx.usuario.createMany({ data: lote });
            }
          }
          if (vendedoresParaCriar.length) {
            for (const lote of this.quebrarEmLotes(vendedoresParaCriar, 500)) {
              await tx.vendedor.createMany({ data: lote });
            }
          }
        });
        relatorio.vendedores.criados += vendedoresParaCriar.length;
      } catch (error) {
        relatorio.vendedores.erros += vendedoresParaCriar.length;
        relatorio.erros.push(
          `Falha em lote ao criar vendedores: ${(error as Error).message}`,
        );
      }
    }

    for (const item of vendedoresParaAtualizar) {
      try {
        await this.prisma.vendedor.update({
          where: { id: item.id },
          data: item.data,
        });
        relatorio.vendedores.atualizados += 1;
      } catch (error) {
        relatorio.vendedores.erros += 1;
        relatorio.erros.push(
          `[${worksheet.name} linha ${item.linha}] Falha ao atualizar vendedor CPF ${item.cpf}: ${(error as Error).message}`,
        );
      }
    }

    for (const [usuarioId, data] of usuariosParaAtualizar.entries()) {
      try {
        await this.prisma.usuario.update({
          where: { id: usuarioId },
          data,
        });
      } catch (error) {
        relatorio.vendedores.erros += 1;
        relatorio.erros.push(
          `[${worksheet.name}] Falha ao atualizar usuário ${usuarioId}: ${(error as Error).message}`,
        );
      }
    }
  }

  private async importarClientes(
    worksheet: ExcelJS.Worksheet,
    relatorio: RelatorioImportacao,
  ): Promise<void> {
    const vendedores = await this.prisma.vendedor.findMany({
      select: { id: true, nome: true },
    });
    const vendedorPorNome = this.mapearPorNome(vendedores);

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      if (!row.hasValues) continue;

      relatorio.clientes.lidos += 1;

      const nome = this.texto(row.getCell(3).value);
      const cpf = this.cpf(row.getCell(4).value);
      const email = this.email(row.getCell(13).value);
      const nomeVendedor = this.texto(row.getCell(14).value);

      if (!nome || !cpf) {
        relatorio.clientes.ignorados += 1;
        relatorio.erros.push(
          `[${worksheet.name} linha ${rowNumber}] Cliente ignorado: nome/cpf obrigatórios`,
        );
        continue;
      }

      const vendedorId = nomeVendedor
        ? this.buscarRelacionamentoPorNome(nomeVendedor, vendedorPorNome)
        : null;

      if (nomeVendedor && !vendedorId) {
        relatorio.clientes.ignorados += 1;
        relatorio.erros.push(
          `[${worksheet.name} linha ${rowNumber}] Vendedor não encontrado para "${nomeVendedor}"`,
        );
        continue;
      }

      try {
        const codigo = await this.resolverCodigoCliente(
          this.numero(row.getCell(1).value),
        );
        const existente = await this.prisma.cliente.findUnique({
          where: { cpf },
        });

        if (existente) {
          await this.prisma.cliente.update({
            where: { id: existente.id },
            data: {
              vendedorId,
              nome,
              telefone: this.texto(row.getCell(5).value) ?? undefined,
              dataNascimento: this.data(row.getCell(6).value),
              cep: this.texto(row.getCell(7).value),
              endereco: this.texto(row.getCell(8).value),
              numero: this.texto(row.getCell(9).value),
              cidade: this.texto(row.getCell(10).value),
              bairro: this.texto(row.getCell(11).value),
              estado: this.texto(row.getCell(12).value),
              email,
            },
          });
          relatorio.clientes.atualizados += 1;
          continue;
        }

        await this.prisma.cliente.create({
          data: {
            ...(codigo ? { codigo } : {}),
            cpf,
            nome,
            telefone: this.texto(row.getCell(5).value) ?? '',
            dataNascimento: this.data(row.getCell(6).value),
            cep: this.texto(row.getCell(7).value),
            endereco: this.texto(row.getCell(8).value),
            numero: this.texto(row.getCell(9).value),
            cidade: this.texto(row.getCell(10).value),
            bairro: this.texto(row.getCell(11).value),
            estado: this.texto(row.getCell(12).value),
            email,
            vendedorId,
            status: StatusUsuario.ATIVO,
          },
        });

        relatorio.clientes.criados += 1;
      } catch (error) {
        relatorio.clientes.erros += 1;
        relatorio.erros.push(
          `[${worksheet.name} linha ${rowNumber}] Falha ao importar cliente CPF ${cpf}: ${(error as Error).message}`,
        );
      }
    }
  }

  private identificarTipoPlanilha(worksheet: ExcelJS.Worksheet): TipoPlanilha {
    const nomePlanilha = this.normalizar(worksheet.name);
    if (nomePlanilha.includes('distribuidor')) return 'DISTRIBUIDORES';
    if (nomePlanilha.includes('vendedor')) return 'VENDEDORES';
    if (nomePlanilha.includes('cliente')) return 'CLIENTES';

    const header = worksheet.getRow(1);
    const headersNormalizados = new Set<string>();
    for (let col = 1; col <= header.cellCount; col += 1) {
      const valor = this.texto(header.getCell(col).value);
      if (valor) headersNormalizados.add(this.normalizar(valor));
    }

    if (headersNormalizados.has('nomedistribuidor')) return 'VENDEDORES';
    if (headersNormalizados.has('nomevendedor')) return 'CLIENTES';
    if (headersNormalizados.has('totalvendedores')) return 'DISTRIBUIDORES';

    return 'DESCONHECIDA';
  }

  private async obterOuCriarUsuario(
    tx: Prisma.TransactionClient,
    payload: {
      cpf: string;
      email: string;
      perfil: Perfil;
      senhaPadrao: string;
    },
  ) {
    const usuarioCpf = await tx.usuario.findUnique({
      where: { cpf: payload.cpf },
    });
    const usuarioEmail = await tx.usuario.findUnique({
      where: { email: payload.email },
    });
    const usuarioExistente = usuarioCpf ?? usuarioEmail;

    if (usuarioExistente) {
      if (usuarioExistente.perfil !== payload.perfil) {
        throw new BadRequestException(
          `Usuário ${payload.cpf} já existe com perfil ${usuarioExistente.perfil}`,
        );
      }

      const senhaHash = usuarioExistente.senhaHash
        ? undefined
        : await bcrypt.hash(payload.senhaPadrao, 10);

      return tx.usuario.update({
        where: { id: usuarioExistente.id },
        data: {
          cpf: payload.cpf,
          email: payload.email,
          perfil: payload.perfil,
          status: StatusUsuario.ATIVO,
          ...(senhaHash ? { senhaHash } : {}),
        },
      });
    }

    return tx.usuario.create({
      data: {
        cpf: payload.cpf,
        email: payload.email,
        perfil: payload.perfil,
        status: StatusUsuario.ATIVO,
        senhaHash: await bcrypt.hash(payload.senhaPadrao, 10),
      },
    });
  }

  private mapearPorNome(
    registros: Array<{ id: string; nome: string }>,
  ): Map<string, string[]> {
    const mapa = new Map<string, string[]>();
    for (const registro of registros) {
      const chave = this.normalizar(registro.nome);
      if (!chave) continue;
      const atual = mapa.get(chave) ?? [];
      atual.push(registro.id);
      mapa.set(chave, atual);
    }
    return mapa;
  }

  private buscarRelacionamentoPorNome(
    nome: string,
    mapa: Map<string, string[]>,
  ): string | null {
    const chave = this.normalizar(nome);
    const ids = mapa.get(chave) ?? [];
    if (ids.length !== 1) return null;
    return ids[0];
  }

  private novaContagem(): ContagemImportacao {
    return { lidos: 0, criados: 0, atualizados: 0, ignorados: 0, erros: 0 };
  }

  private texto(value: ExcelJS.CellValue): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      const v = value.trim();
      return v ? v : null;
    }
    if (typeof value === 'number') return String(value);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'object') {
      if ('text' in value && value.text) return String(value.text).trim();
      if (
        'result' in value &&
        value.result !== null &&
        value.result !== undefined
      ) {
        if (
          typeof value.result === 'string' ||
          typeof value.result === 'number' ||
          typeof value.result === 'boolean' ||
          typeof value.result === 'bigint'
        ) {
          return String(value.result).trim();
        }
      }
    }
    return null;
  }

  private numero(value: ExcelJS.CellValue): number | null {
    const txt = this.texto(value);
    if (!txt) return null;
    const digits = txt.replace(/\D/g, '');
    if (!digits) return null;
    const parsed = Number(digits);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private async resolverCodigoDistribuidor(
    codigo: number | null,
  ): Promise<number | null> {
    if (!codigo) return null;
    const existe = await this.prisma.distribuidor.findUnique({
      where: { codigo },
      select: { id: true },
    });
    return existe ? null : codigo;
  }

  private async resolverCodigoVendedor(
    codigo: number | null,
  ): Promise<number | null> {
    if (!codigo) return null;
    const existe = await this.prisma.vendedor.findUnique({
      where: { codigo },
      select: { id: true },
    });
    return existe ? null : codigo;
  }

  private async resolverCodigoCliente(
    codigo: number | null,
  ): Promise<number | null> {
    if (!codigo) return null;
    const existe = await this.prisma.cliente.findUnique({
      where: { codigo },
      select: { id: true },
    });
    return existe ? null : codigo;
  }

  private cpf(value: ExcelJS.CellValue): string | null {
    const txt = this.texto(value);
    if (!txt) return null;
    const digits = txt.replace(/\D/g, '');
    if (!digits) return null;
    const cpf = digits.length < 11 ? digits.padStart(11, '0') : digits;
    return cpf.length === 11 ? cpf : null;
  }

  private data(value: ExcelJS.CellValue): Date | undefined {
    if (!value) return undefined;
    if (value instanceof Date) return value;
    const txt = this.texto(value);
    if (!txt) return undefined;
    const data = new Date(txt);
    return Number.isNaN(data.getTime()) ? undefined : data;
  }

  private email(value: ExcelJS.CellValue): string | null {
    const txt = this.texto(value);
    if (!txt) return null;
    const match = txt.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
    if (!match) return null;
    return match[0].toLowerCase();
  }

  private extrairNomeRelacionamento(
    campos: Array<string | null>,
  ): string | null {
    for (const valor of campos) {
      if (!valor) continue;
      const semEmail = valor
        .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!semEmail || /^\d+$/.test(semEmail)) continue;
      return semEmail;
    }

    return null;
  }

  private isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private normalizar(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private quebrarEmLotes<T>(items: T[], tamanhoLote: number): T[][] {
    const lotes: T[][] = [];
    for (let index = 0; index < items.length; index += tamanhoLote) {
      lotes.push(items.slice(index, index + tamanhoLote));
    }
    return lotes;
  }
}
