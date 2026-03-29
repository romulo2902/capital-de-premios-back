import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import { Perfil, Prisma, StatusUsuario } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import {
  buscarRelacionamentoPorNome as buscarRelacionamentoPorNomeUtil,
  cpf as cpfUtil,
  data as dataUtil,
  email as emailUtil,
  extrairNomeRelacionamento as extrairNomeRelacionamentoUtil,
  gerarEmailUsuarioMigradoConflito as gerarEmailUsuarioMigradoConflitoUtil,
  gerarEmailUsuarioVendedorImportacao as gerarEmailUsuarioVendedorImportacaoUtil,
  identificarTipoPlanilha as identificarTipoPlanilhaUtil,
  isEmail as isEmailUtil,
  mapearPorNome as mapearPorNomeUtil,
  normalizar as normalizarUtil,
  novaContagem as novaContagemUtil,
  numero as numeroUtil,
  quebrarEmLotes as quebrarEmLotesUtil,
  texto as textoUtil,
} from './migracao.util';
import type {
  ArquivoXlsxUpload,
  ContagemImportacao,
  LinhaVendedorImportacao,
  RelatorioImportacao,
  TipoPlanilha,
} from './migracao.types';

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
            data: {
              cpf,
              email,
              perfil: Perfil.DISTRIBUIDOR,
              deveRedefinirSenha: true,
            },
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

    const [vendedoresExistentes, usuariosExistentes] = await Promise.all([
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
    const usuarioIdsParaCriacaoVendedor = new Set<string>();
    const indiceCriacaoPorUsuarioId = new Map<string, number>();
    const usuarioIdsNovos = new Set<string>();

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
          deveRedefinirSenha: true,
          status: StatusUsuario.ATIVO,
        });
        continue;
      }

      const usuarioExistente =
        usuarioPorCpf.get(linha.cpf) ?? usuarioPorEmail.get(linha.email);
      let usuarioId: string;
      if (
        usuarioExistente &&
        usuarioExistente.perfil !== Perfil.VENDEDOR &&
        usuarioExistente.perfil !== Perfil.DISTRIBUIDOR
      ) {
        relatorio.vendedores.ignorados += 1;
        relatorio.erros.push(
          `[${worksheet.name} linha ${linha.rowNumber}] Usuário ${linha.cpf} já existe com perfil ${usuarioExistente.perfil}`,
        );
        continue;
      }

      if (usuarioExistente && usuarioExistente.perfil === Perfil.DISTRIBUIDOR) {
        usuarioId = randomUUID();
        const emailUsuarioVendedor = this.gerarEmailUsuarioVendedorImportacao(
          linha.cpf,
          linha.rowNumber,
        );

        usuariosParaCriar.push({
          id: usuarioId,
          cpf: null,
          email: emailUsuarioVendedor,
          senhaHash: senhaVendedorHash,
          perfil: Perfil.VENDEDOR,
          deveRedefinirSenha: true,
          status: StatusUsuario.ATIVO,
        });
        usuarioIdsNovos.add(usuarioId);
        usuarioPorEmail.set(emailUsuarioVendedor, {
          id: usuarioId,
          cpf: null,
          email: emailUsuarioVendedor,
          perfil: Perfil.VENDEDOR,
          senhaHash: senhaVendedorHash,
        });
      } else if (usuarioExistente) {
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
            deveRedefinirSenha: true,
            status: StatusUsuario.ATIVO,
            ...(usuarioExistente.senhaHash
              ? {}
              : { senhaHash: senhaVendedorHash }),
          });
          continue;
        }

        if (usuarioIdsParaCriacaoVendedor.has(usuarioId)) continue;
        if (!usuarioIdsNovos.has(usuarioId)) {
          usuariosParaAtualizar.set(usuarioId, {
            cpf: linha.cpf,
            email: linha.email,
            perfil: Perfil.VENDEDOR,
            deveRedefinirSenha: true,
            status: StatusUsuario.ATIVO,
            ...(usuarioExistente.senhaHash
              ? {}
              : { senhaHash: senhaVendedorHash }),
          });
        }
      } else {
        usuarioId = randomUUID();
        usuariosParaCriar.push({
          id: usuarioId,
          cpf: linha.cpf,
          email: linha.email,
          senhaHash: senhaVendedorHash,
          perfil: Perfil.VENDEDOR,
          deveRedefinirSenha: true,
          status: StatusUsuario.ATIVO,
        });

        const novoUsuario = {
          id: usuarioId,
          cpf: linha.cpf,
          email: linha.email,
          perfil: Perfil.VENDEDOR,
          deveRedefinirSenha: true,
          senhaHash: senhaVendedorHash,
        };
        usuarioIdsNovos.add(usuarioId);
        usuarioPorCpf.set(linha.cpf, novoUsuario);
        usuarioPorEmail.set(linha.email, novoUsuario);
      }

      const vendedorParaCriar: Prisma.VendedorCreateManyInput = {
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
      };

      if (usuarioIdsParaCriacaoVendedor.has(usuarioId)) {
        const indiceExistente = indiceCriacaoPorUsuarioId.get(usuarioId);
        if (indiceExistente !== undefined) {
          vendedoresParaCriar[indiceExistente] = vendedorParaCriar;
        }
        continue;
      }

      usuarioIdsParaCriacaoVendedor.add(usuarioId);
      indiceCriacaoPorUsuarioId.set(usuarioId, vendedoresParaCriar.length);
      vendedoresParaCriar.push(vendedorParaCriar);
    }

    if (usuariosParaCriar.length || vendedoresParaCriar.length) {
      try {
        await this.prisma.$transaction(async (tx) => {
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
    const [vendedores, distribuidores] = await Promise.all([
      this.prisma.vendedor.findMany({
        select: { id: true, nome: true },
      }),
      this.prisma.distribuidor.findMany({
        select: { id: true, nome: true },
      }),
    ]);
    const vendedorPorNome = this.mapearPorNome(vendedores);
    const distribuidorPorNome = this.mapearPorNome(distribuidores);

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      if (!row.hasValues) continue;

      relatorio.clientes.lidos += 1;

      const nome = this.texto(row.getCell(3).value);
      const cpf = this.cpf(row.getCell(4).value);
      const email = this.email(row.getCell(13).value);
      const nomeVendedorOuDistribuidor = this.texto(row.getCell(14).value);

      if (!nome || !cpf) {
        relatorio.clientes.ignorados += 1;
        relatorio.erros.push(
          `[${worksheet.name} linha ${rowNumber}] Cliente ignorado: nome/cpf obrigatórios`,
        );
        continue;
      }

      const vendedorId = nomeVendedorOuDistribuidor
        ? this.buscarRelacionamentoPorNome(
            nomeVendedorOuDistribuidor,
            vendedorPorNome,
          )
        : null;
      const distribuidorId =
        !vendedorId && nomeVendedorOuDistribuidor
          ? this.buscarRelacionamentoPorNome(
              nomeVendedorOuDistribuidor,
              distribuidorPorNome,
            )
          : null;

      try {
        const existente = await this.prisma.cliente.findUnique({
          where: { cpf },
        });

        if (existente) {
          await this.prisma.cliente.update({
            where: { id: existente.id },
            data: {
              vendedorId,
              distribuidorId,
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

        const dataCriacaoCliente: Prisma.ClienteUncheckedCreateInput = {
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
          distribuidorId,
          status: StatusUsuario.ATIVO,
        };

        await this.prisma.cliente.create({ data: dataCriacaoCliente });

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
    return identificarTipoPlanilhaUtil(worksheet);
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
    if (usuarioCpf && usuarioEmail && usuarioCpf.id !== usuarioEmail.id) {
      throw new BadRequestException(
        `Conflito de identidade para CPF ${payload.cpf} e email ${payload.email}: registros de usuário distintos`,
      );
    }

    const usuarioExistente = usuarioCpf ?? usuarioEmail;
    if (usuarioExistente) {
      if (usuarioExistente.perfil !== payload.perfil) {
        return tx.usuario.create({
          data: {
            cpf: usuarioCpf ? null : payload.cpf,
            email: usuarioEmail
              ? this.gerarEmailUsuarioMigradoConflito(
                  payload.cpf,
                  payload.perfil,
                )
              : payload.email,
            perfil: payload.perfil,
            deveRedefinirSenha: true,
            status: StatusUsuario.ATIVO,
            senhaHash: await bcrypt.hash(payload.senhaPadrao, 10),
          },
        });
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
          deveRedefinirSenha: true,
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
        deveRedefinirSenha: true,
        status: StatusUsuario.ATIVO,
        senhaHash: await bcrypt.hash(payload.senhaPadrao, 10),
      },
    });
  }

  private mapearPorNome(
    registros: Array<{ id: string; nome: string }>,
  ): Map<string, string[]> {
    return mapearPorNomeUtil(registros);
  }

  private buscarRelacionamentoPorNome(
    nome: string,
    mapa: Map<string, string[]>,
  ): string | null {
    return buscarRelacionamentoPorNomeUtil(nome, mapa);
  }

  private novaContagem(): ContagemImportacao {
    return novaContagemUtil();
  }

  private texto(value: ExcelJS.CellValue): string | null {
    return textoUtil(value);
  }

  private numero(value: ExcelJS.CellValue): number | null {
    return numeroUtil(value);
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

  private cpf(value: ExcelJS.CellValue): string | null {
    return cpfUtil(value);
  }

  private data(value: ExcelJS.CellValue): Date | undefined {
    return dataUtil(value);
  }

  private email(value: ExcelJS.CellValue): string | null {
    return emailUtil(value);
  }

  private extrairNomeRelacionamento(
    campos: Array<string | null>,
  ): string | null {
    return extrairNomeRelacionamentoUtil(campos);
  }

  private gerarEmailUsuarioVendedorImportacao(
    cpf: string,
    rowNumber: number,
  ): string {
    return gerarEmailUsuarioVendedorImportacaoUtil(cpf, rowNumber);
  }

  private gerarEmailUsuarioMigradoConflito(
    cpf: string,
    perfil: Perfil,
  ): string {
    return gerarEmailUsuarioMigradoConflitoUtil(cpf, perfil);
  }

  private isEmail(value: string): boolean {
    return isEmailUtil(value);
  }

  private normalizar(value: string): string {
    return normalizarUtil(value);
  }

  private quebrarEmLotes<T>(items: T[], tamanhoLote: number): T[][] {
    return quebrarEmLotesUtil(items, tamanhoLote);
  }
}
