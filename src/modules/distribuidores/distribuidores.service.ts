import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Perfil, Prisma, StatusUsuario, StatusVenda } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { QrcodeService } from '../qrcode/qrcode.service';
import { CreateDistribuidorDto } from './dto/create-distribuidor.dto';
import { UpdateDistribuidorDto } from './dto/update-distribuidor.dto';
import { FiltroPerformanceDto } from './dto/filtro-performance.dto';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';
import { calcularQuantidadeCartelasDaVenda } from '../vendas/vendas-quantidade.util';
import { buildBuscaPorTexto } from '../../common/utils/busca-cadastro.util';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

@Injectable()
export class DistribuidoresService {
  private readonly logger = new Logger(DistribuidoresService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qrcodeService: QrcodeService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Recorte de tudo que o módulo lê: o filtro de excluídos.
   *
   * O `deletedAt: null` mora aqui, e não em cada consulta, porque é o único
   * ponto por onde toda leitura passa — `findAll`, `findOne`, `findByCodigo` e
   * `update`. Consulta nova que não use o escopo é a forma mais fácil de um
   * cadastro excluído reaparecer.
   *
   * `incluirExcluidos` existe só para a listagem achar o que foi excluído: sem
   * ela, o id de um excluído seria impossível de descobrir pela API, e
   * `restaurar` não teria como ser chamado.
   */
  private buildEscopoDoOperador(
    incluirExcluidos = false,
  ): Prisma.DistribuidorWhereInput {
    return incluirExcluidos ? {} : { deletedAt: null };
  }

  /**
   * Token opaco do link publico de auto-cadastro.
   *
   * Mesmo formato do `@default(uuid())` que preenche a coluna no cadastro:
   * 128 bits de entropia, fora de alcance de varredura. O valor e rotacionavel,
   * entao um link vazado morre trocando a coluna.
   */
  private gerarTokenCadastro(): string {
    return randomUUID();
  }

  /**
   * O formulario publico mora no painel, nao na loja: quem se cadastra ali vai
   * usar o painel depois, e a pagina reaproveita os componentes de cadastro
   * que ja existem. Por isso a base e `FRONTEND_ADMIN_URL`.
   *
   * O `/#/` nao e enfeite: o painel e Flutter web na estrategia de hash, entao
   * a rota vive depois do `#`. Sem ele o servidor devolve o index, o app sobe
   * em `#/home` e o link cai no login em vez do formulario.
   */
  private montarLinkCadastro(token: string): string {
    const base = (this.config.get<string>('FRONTEND_ADMIN_URL') ?? '').replace(
      /\/+$/,
      '',
    );
    return `${base}/#/cadastro-vendedor/${token}`;
  }

  /**
   * Resolve de qual rede e o link. DISTRIBUIDOR so alcanca a propria: o id vem
   * do token e o parametro e descartado, como no resto do projeto.
   */
  private resolverDistribuidorDoLink(
    distribuidorIdParam: string | undefined,
    user: RequestUser,
  ): string {
    if (user.perfil === 'DISTRIBUIDOR') {
      if (!user.distribuidorId) {
        throw new ForbiddenException(
          'Operador distribuidor sem vínculo válido',
        );
      }
      return user.distribuidorId;
    }

    if (!distribuidorIdParam) {
      throw new BadRequestException(
        'distribuidorId é obrigatório para o perfil ADMIN',
      );
    }

    return distribuidorIdParam;
  }

  /** Link publico de auto-cadastro de vendedor da rede. */
  async consultarLinkCadastro(
    distribuidorId: string | undefined,
    user: RequestUser,
  ) {
    const alvo = this.resolverDistribuidorDoLink(distribuidorId, user);
    // Mesmo filtro da ponta publica (`buscarRedePorTokenDeCadastro`): rede
    // inativa nao tem link para divulgar. Sem ele, o painel entregava uma URL
    // bem formada que dava 404 em todo mundo que a abrisse, sem nenhum aviso.
    const distribuidor = await this.prisma.distribuidor.findFirst({
      where: { id: alvo, status: StatusUsuario.ATIVO },
      select: { id: true, nome: true, tokenCadastro: true },
    });

    if (!distribuidor) {
      throw new NotFoundException('Distribuidor não encontrado');
    }

    return {
      message: 'Link de cadastro consultado com sucesso',
      data: {
        distribuidorId: distribuidor.id,
        nome: distribuidor.nome,
        token: distribuidor.tokenCadastro,
        url: this.montarLinkCadastro(distribuidor.tokenCadastro),
      },
    };
  }

  /**
   * Gera um token novo e derruba o anterior.
   *
   * E o unico jeito de estancar um link que vazou: quem tiver a URL antiga
   * passa a receber 404 na hora, sem afetar quem ja foi cadastrado por ela.
   */
  async regenerarTokenCadastro(
    distribuidorId: string | undefined,
    user: RequestUser,
  ) {
    const alvo = this.resolverDistribuidorDoLink(distribuidorId, user);
    const existe = await this.prisma.distribuidor.findUnique({
      where: { id: alvo },
      select: { id: true },
    });

    if (!existe) {
      throw new NotFoundException('Distribuidor não encontrado');
    }

    const token = this.gerarTokenCadastro();
    const distribuidor = await this.prisma.distribuidor.update({
      where: { id: alvo },
      data: { tokenCadastro: token },
      select: { id: true, nome: true, tokenCadastro: true, status: true },
    });

    this.logger.log(`Token de cadastro regenerado para ${distribuidor.nome}`);

    // A rotacao vale para rede inativa — queimar um token vazado nao depende de
    // a rede estar operando, e bloquear a chamada tiraria a unica forma de
    // fazer isso antes de uma reativacao. O que nao vale e devolver a URL: a
    // rota publica filtra `status: ATIVO`, entao ela daria 404 em quem abrisse.
    const ativo = distribuidor.status === StatusUsuario.ATIVO;

    return {
      message: ativo
        ? 'Link de cadastro regenerado. O link anterior deixou de valer.'
        : 'Token regenerado e o anterior deixou de valer. A rede está inativa: o link só volta a funcionar quando ela for reativada.',
      data: {
        distribuidorId: distribuidor.id,
        nome: distribuidor.nome,
        token: distribuidor.tokenCadastro,
        url: ativo ? this.montarLinkCadastro(distribuidor.tokenCadastro) : null,
      },
    };
  }

  private normalizarCpf(cpf: string): string {
    return cpf.replace(/\D/g, '');
  }

  private normalizarEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private gerarSenhaPadraoPorCpf(cpf: string): string {
    return cpf.slice(0, 6);
  }

  private async validarCpfDisponivel(
    cpf: string,
    distribuidorId?: string,
    usuarioId?: string,
  ): Promise<void> {
    const [distribuidorExistente, usuarioExistente] = await Promise.all([
      this.prisma.distribuidor.findFirst({
        where: {
          cpf,
          ...(distribuidorId ? { NOT: { id: distribuidorId } } : {}),
        },
        select: { id: true, deletedAt: true },
      }),
      this.prisma.usuario.findFirst({
        where: {
          cpf,
          ...(usuarioId ? { NOT: { id: usuarioId } } : {}),
        },
      }),
    ]);

    // O excluído continua segurando o CPF — `Distribuidor.cpf` e `Usuario.cpf`
    // são `@unique` globais e não abrem exceção para ele. Sem dizer isso, o
    // recadastro batia num "CPF já cadastrado" que não existe em listagem
    // nenhuma, e o caminho certo (restaurar) ficava invisível.
    if (distribuidorExistente?.deletedAt) {
      throw new ConflictException(
        'CPF pertence a um distribuidor excluído. Restaure o cadastro em vez de criar outro.',
      );
    }

    if (distribuidorExistente || usuarioExistente) {
      throw new ConflictException('CPF já cadastrado');
    }
  }

  private async validarEmailDisponivel(
    email: string,
    usuarioId?: string,
  ): Promise<void> {
    const usuarioExistente = await this.prisma.usuario.findFirst({
      where: {
        email,
        ...(usuarioId ? { NOT: { id: usuarioId } } : {}),
      },
    });

    if (usuarioExistente) {
      throw new ConflictException('Email já cadastrado');
    }
  }

  async create(dto: CreateDistribuidorDto) {
    const cpf = this.normalizarCpf(dto.cpf);
    const email = this.normalizarEmail(dto.email);

    await Promise.all([
      this.validarCpfDisponivel(cpf),
      this.validarEmailDisponivel(email),
    ]);

    const senhaHash = dto.senha
      ? await bcrypt.hash(dto.senha, 10)
      : await bcrypt.hash(this.gerarSenhaPadraoPorCpf(cpf), 10);

    return this.prisma
      .$transaction(async (tx) => {
        const usuario = await tx.usuario.create({
          data: {
            email,
            cpf,
            senhaHash,
            perfil: Perfil.DISTRIBUIDOR,
            deveRedefinirSenha: false,
            status: StatusUsuario.ATIVO,
          },
        });

        const distribuidor = await tx.distribuidor.create({
          data: {
            ...(dto.codigo ? { codigo: dto.codigo } : {}),
            usuarioId: usuario.id,
            nome: dto.nome,
            cpf,
            telefone: dto.telefone,
            email,
            dataNascimento: dto.dataNascimento
              ? new Date(dto.dataNascimento)
              : undefined,
            cep: dto.cep,
            endereco: dto.endereco,
            numero: dto.numero,
            bairro: dto.bairro,
            cidade: dto.cidade,
            estado: dto.estado,
            tipoChavePix: dto.tipoChavePix,
            chavePix: dto.chavePix,
            comissaoPercent:
              dto.comissaoPercent !== undefined ? dto.comissaoPercent : 0,
            link: dto.link,
            // `tokenCadastro` sai do DEFAULT do banco: toda rede nasce com
            // link de auto-cadastro pronto, e nenhum call site precisa saber.
            status: StatusUsuario.ATIVO,
          },
        });

        this.logger.log(
          `Distribuidor criado: ${distribuidor.nome} (${distribuidor.codigo})`,
        );
        return distribuidor;
      })
      .then(async (distribuidor) => {
        try {
          await Promise.all([
            this.qrcodeService.gerarQrcodeDistribuidor(distribuidor.id),
            this.qrcodeService.gerarQrcodeSenaDistribuidor(distribuidor.id),
          ]);
        } catch (err) {
          this.logger.warn(
            `Falha ao gerar QR Codes para distribuidor ${distribuidor.id}: ${(err as Error).message}`,
          );
        }
        return distribuidor;
      });
  }

  async findAll(page = 1, limit = 20, search?: string, excluidos?: boolean) {
    const pagination = normalizePagination(page, limit);
    const where: Prisma.DistribuidorWhereInput = {
      ...this.buildEscopoDoOperador(excluidos),
      ...(search ? { OR: buildBuscaPorTexto(search) } : {}),
      // Lixeira: `excluidos` lista SÓ os excluídos, em vez de somá-los à
      // listagem normal. Esta é a única porta por onde o id de um excluído sai
      // da API, e é dela que `restaurar` depende.
      ...(excluidos ? { deletedAt: { not: null } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.distribuidor.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { vendedores: { where: { deletedAt: null } } } },
        },
      }),
      this.prisma.distribuidor.count({ where }),
    ]);

    return buildPaginatedResponse(
      data,
      total,
      pagination.page,
      pagination.limit,
      {
        successMessage: 'Distribuidores listados com sucesso',
        emptyMessage: 'Nenhum distribuidor encontrado',
      },
    );
  }

  async findOne(id: string) {
    // `findFirst`, não `findUnique`: o escopo não é chave única, e `findUnique`
    // não aceita filtro fora dela — seria a porta de um excluído reaparecer.
    const distribuidor = await this.prisma.distribuidor.findFirst({
      where: { id, ...this.buildEscopoDoOperador() },
      include: {
        // O contador acompanha a lista: somar os excluídos daria uma rede com
        // "8 vendedores" e 6 linhas na tela.
        _count: { select: { vendedores: { where: { deletedAt: null } } } },
        vendedores: {
          where: { deletedAt: null },
          select: { id: true, nome: true, codigo: true, status: true },
        },
      },
    });
    if (!distribuidor)
      throw new NotFoundException('Distribuidor não encontrado');
    return distribuidor;
  }

  async findByCodigo(codigo: number) {
    const distribuidor = await this.prisma.distribuidor.findFirst({
      where: { codigo, ...this.buildEscopoDoOperador() },
    });
    if (!distribuidor)
      throw new NotFoundException('Distribuidor não encontrado');
    return distribuidor;
  }

  async update(id: string, dto: UpdateDistribuidorDto) {
    // Excluído não se edita: o `PATCH` é o caminho de reativar (`status:
    // ATIVO`), e sem o escopo aqui ele devolvia à operação quem tinha sumido da
    // listagem, pulando o `restaurar`.
    const distribuidorAtual = await this.prisma.distribuidor.findFirst({
      where: { id, ...this.buildEscopoDoOperador() },
      select: { id: true, usuarioId: true },
    });

    if (!distribuidorAtual) {
      throw new NotFoundException('Distribuidor não encontrado');
    }

    if (dto.cpf) {
      await this.validarCpfDisponivel(
        this.normalizarCpf(dto.cpf),
        id,
        distribuidorAtual.usuarioId,
      );
    }

    if (dto.email) {
      await this.validarEmailDisponivel(
        this.normalizarEmail(dto.email),
        distribuidorAtual.usuarioId,
      );
    }

    const data: Record<string, unknown> = { ...dto };
    delete data.senha;
    delete data.codigo;
    if (dto.cpf) data.cpf = this.normalizarCpf(dto.cpf);
    if (dto.email) data.email = this.normalizarEmail(dto.email);
    if (dto.dataNascimento) data.dataNascimento = new Date(dto.dataNascimento);
    if (dto.link !== undefined) data.qrcode = null;

    const usuarioData: Prisma.UsuarioUpdateInput = {};
    if (dto.cpf) usuarioData.cpf = this.normalizarCpf(dto.cpf);
    if (dto.email) usuarioData.email = this.normalizarEmail(dto.email);
    // Mesmo motivo do Vendedor: o login do painel valida `Usuario.status`.
    if (dto.status) usuarioData.status = dto.status;

    if (dto.senha) {
      usuarioData.senhaHash = await bcrypt.hash(dto.senha, 10);
      usuarioData.deveRedefinirSenha = false;
    }

    return this.prisma.$transaction(async (tx) => {
      if (Object.keys(usuarioData).length > 0) {
        await tx.usuario.update({
          where: { id: distribuidorAtual.usuarioId },
          data: usuarioData,
        });
      }

      return tx.distribuidor.update({ where: { id }, data });
    });
  }

  async remove(id: string) {
    const distribuidor = await this.findOne(id);

    // As duas linhas caem juntas: inativar só o Distribuidor deixaria o login
    // do painel de pé, porque ele valida `Usuario.status`.
    return this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: distribuidor.usuarioId },
        data: { status: StatusUsuario.INATIVO },
      });

      return tx.distribuidor.update({
        where: { id },
        data: { status: StatusUsuario.INATIVO },
      });
    });
  }

  /**
   * Exclusão lógica — ADMIN apenas.
   *
   * Some de toda listagem e do seletor de rede, mas o registro fica: Venda,
   * ComissaoDistribuidor, Saque e Maquininha apontam para ele, e apagar de
   * verdade levaria o histórico junto.
   *
   * Excluir também inativa, nas duas tabelas. Não é redundância com `remove`:
   * é o que faz os caminhos que só conhecem `status` — login, link público de
   * auto-cadastro — barrarem o excluído sem precisar aprender o `deletedAt`.
   */
  async excluir(id: string) {
    const distribuidor = await this.findOne(id);

    // Sumir da listagem levando o saldo junto prenderia a comissão da rede sem
    // tela para pagá-la. O caminho é liquidar o saque antes.
    if (distribuidor.saldo.gt(0)) {
      throw new ConflictException(
        `O distribuidor ${distribuidor.nome} ainda tem R$ ${distribuidor.saldo.toFixed(2)} ` +
          'de saldo. Liquide o saque antes de excluir.',
      );
    }

    // `Vendedor.distribuidorId` é NOT NULL: excluir a rede por cima dos
    // vendedores deixaria cada um deles apontando para um distribuidor que
    // sumiu de toda listagem — visíveis no painel, sem rede alcançável. O
    // caminho é transferir os vendedores (PATCH com `distribuidorId`) ou
    // excluí-los antes.
    const vendedoresNaRede = await this.prisma.vendedor.count({
      where: { distribuidorId: id, deletedAt: null },
    });

    if (vendedoresNaRede > 0) {
      throw new ConflictException(
        `O distribuidor ${distribuidor.nome} ainda tem ${vendedoresNaRede} vendedor(es) na rede. ` +
          'Transfira ou exclua os vendedores antes.',
      );
    }

    // Mesmo motivo, para a frota: `Maquininha.distribuidorId` também é NOT
    // NULL, e o aparelho carrega saldo de crédito próprio.
    const maquininhasNaRede = await this.prisma.maquininha.count({
      where: { distribuidorId: id, deletedAt: null },
    });

    if (maquininhasNaRede > 0) {
      throw new ConflictException(
        `O distribuidor ${distribuidor.nome} ainda tem ${maquininhasNaRede} maquininha(s) na rede. ` +
          'Exclua os aparelhos antes.',
      );
    }

    this.logger.log(
      `Excluindo distribuidor ${distribuidor.nome} (${distribuidor.codigo})`,
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: distribuidor.usuarioId },
        data: { status: StatusUsuario.INATIVO },
      });

      return tx.distribuidor.update({
        where: { id },
        data: { status: StatusUsuario.INATIVO, deletedAt: new Date() },
      });
    });
  }

  /**
   * Desfaz a exclusão — ADMIN apenas.
   *
   * O cadastro volta INATIVO, não ATIVO: restaurar devolve o registro à
   * listagem, e quem decide se ele opera de novo é o `PATCH` de status. Sem
   * este caminho, excluir por engano seria definitivo — o CPF continua
   * `@unique` e seguraria o recadastro para sempre.
   */
  async restaurar(id: string) {
    const distribuidor = await this.prisma.distribuidor.findFirst({
      where: { id, ...this.buildEscopoDoOperador(true) },
      select: { id: true, nome: true, codigo: true, deletedAt: true },
    });

    if (!distribuidor) {
      throw new NotFoundException('Distribuidor não encontrado');
    }

    if (!distribuidor.deletedAt) {
      throw new ConflictException('Este distribuidor não está excluído');
    }

    this.logger.log(
      `Restaurando distribuidor ${distribuidor.nome} (${distribuidor.codigo})`,
    );

    return this.prisma.distribuidor.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  // ─── PERFORMANCE DE VENDAS ────────────────────────────

  async performanceVendas(
    page = 1,
    limit = 20,
    filtros?: FiltroPerformanceDto,
  ) {
    this.logger.log('Consultando performance de vendas dos distribuidores');

    const vendaWhere = this.buildVendaWhere(filtros);
    const comissaoWhere = this.buildComissaoWhere(filtros);
    const searchWhere: Prisma.DistribuidorWhereInput = filtros?.search
      ? {
          OR: [
            { nome: { contains: filtros.search, mode: 'insensitive' } },
            { cpf: { contains: filtros.search } },
            { email: { contains: filtros.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const pagination = normalizePagination(page, limit);

    const distribuidores = await this.prisma.distribuidor.findMany({
      where: searchWhere,
      select: {
        id: true,
        codigo: true,
        nome: true,
        tipoChavePix: true,
        chavePix: true,
        vendedores: {
          select: {
            vendas: {
              where: { ...vendaWhere, status: StatusVenda.APROVADO },
              select: {
                quantidade: true,
                tipoCartela: true,
                total: true,
              },
            },
            comissoes: {
              where: comissaoWhere,
              select: {
                valor: true,
              },
            },
          },
        },
      },
      orderBy: { nome: 'asc' },
    });

    // Agregar dados (somar vendas de todos os vendedores do distribuidor)
    const performance = distribuidores.map((d) => {
      let qtdCartelas = 0;
      let totalVendas = 0;
      let comissao = 0;

      for (const vendedor of d.vendedores) {
        for (const venda of vendedor.vendas) {
          qtdCartelas += calcularQuantidadeCartelasDaVenda({
            quantidade: venda.quantidade,
            tipoCartela: venda.tipoCartela,
          });
          totalVendas += Number(venda.total);
        }
        for (const c of vendedor.comissoes) {
          comissao += Number(c.valor);
        }
      }

      return {
        id: d.id,
        codigo: d.codigo,
        nome: d.nome,
        tipoChavePix: d.tipoChavePix,
        chavePix: d.chavePix,
        qtdCartelas,
        totalVendas,
        comissao,
      };
    });

    // Ordenar por totalVendas desc
    performance.sort((a, b) => b.totalVendas - a.totalVendas);

    // Top 10 (para gráfico)
    const top10 = performance.slice(0, 10).map((item) => ({
      id: item.id,
      nome: item.nome,
      totalVendas: item.totalVendas,
    }));

    // Paginar
    const total = performance.length;
    const paginatedData = performance.slice(
      pagination.skip,
      pagination.skip + pagination.limit,
    );

    return {
      message:
        paginatedData.length > 0
          ? 'Performance de distribuidores consultada com sucesso'
          : 'Nenhum distribuidor encontrado',
      top10,
      data: paginatedData,
      meta: {
        total,
        page: pagination.page,
        limit: pagination.limit,
        lastPage: total > 0 ? Math.ceil(total / pagination.limit) : 0,
      },
    };
  }

  // ─── HELPERS PRIVADOS ─────────────────────────────────

  private buildVendaWhere(
    filtros?: FiltroPerformanceDto,
  ): Prisma.VendaWhereInput {
    const where: Prisma.VendaWhereInput = {};
    if (!filtros) return where;

    if (filtros.edicaoId) where.edicaoId = filtros.edicaoId;

    if (filtros.dataInicio || filtros.dataFim) {
      where.createdAt = {};
      if (filtros.dataInicio) {
        where.createdAt.gte = new Date(filtros.dataInicio);
      }
      if (filtros.dataFim) {
        const dataFim = new Date(filtros.dataFim);
        dataFim.setHours(23, 59, 59, 999);
        where.createdAt.lte = dataFim;
      }
    }

    return where;
  }

  private buildComissaoWhere(
    filtros?: FiltroPerformanceDto,
  ): Prisma.ComissaoWhereInput {
    if (!filtros?.dataInicio && !filtros?.dataFim) return {};

    const where: Prisma.ComissaoWhereInput = {};
    where.createdAt = {};

    if (filtros.dataInicio) {
      where.createdAt.gte = new Date(filtros.dataInicio);
    }
    if (filtros.dataFim) {
      const dataFim = new Date(filtros.dataFim);
      dataFim.setHours(23, 59, 59, 999);
      where.createdAt.lte = dataFim;
    }

    return where;
  }
}
