import {
  DestinoEdicao,
  OrigemParticipacao,
  Perfil,
  Prisma,
  PrismaClient,
  StatusComissao,
  StatusEdicao,
  StatusUsuario,
  StatusVenda,
  TipoCartela,
  TipoChavePix,
  TipoPagamento,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { gerarSequenciaLoterica } from '../src/modules/edicoes/edicoes-sequencia.util';

const prisma = new PrismaClient();

const SEED_TAG = 'seed-vendas-marco-2026';
const TOTAL_VENDAS = 120;
const TOTAL_CLIENTES = 36;
const RANGE_BATCH_SIZE = 200;
const RANGE_SEED = `${SEED_TAG}-ranges`;

const DISTRIBUIDOR_BASE = {
  email: 'seed.vendas.distribuidor@capitalpremios.com',
  cpf: '91000000001',
  senha: 'Seed@123',
  nome: 'Distribuidor Seed Vendas',
  telefone: '11940000001',
  cidade: 'Sao Paulo',
  estado: 'SP',
  comissaoPercent: 18,
} as const;

const VENDEDORES_BASE = [
  {
    email: 'seed.vendas.vendedor1@capitalpremios.com',
    cpf: '91000000011',
    senha: 'Seed@123',
    nome: 'Vendedor Seed Norte',
    telefone: '11940000011',
    cidade: 'Sao Paulo',
    estado: 'SP',
    comissaoPercent: 45,
  },
  {
    email: 'seed.vendas.vendedor2@capitalpremios.com',
    cpf: '91000000022',
    senha: 'Seed@123',
    nome: 'Vendedor Seed Sul',
    telefone: '11940000022',
    cidade: 'Campinas',
    estado: 'SP',
    comissaoPercent: 35,
  },
] as const;

const NOMES_CLIENTES = [
  'Ana Martins',
  'Bruno Araujo',
  'Camila Souza',
  'Daniel Lima',
  'Eduarda Rocha',
  'Felipe Gomes',
  'Gabriela Alves',
  'Henrique Nunes',
  'Isabela Ribeiro',
  'Joao Cardoso',
  'Karen Duarte',
  'Lucas Moreira',
  'Mariana Castro',
  'Nathan Ferreira',
  'Olivia Santana',
  'Paulo Teixeira',
  'Quezia Moura',
  'Rafael Melo',
  'Sabrina Costa',
  'Thiago Rezende',
  'Ursula Pires',
  'Vinicius Farias',
  'Wesley Campos',
  'Ximena Barros',
  'Yasmin Freitas',
  'Zeca Batista',
  'Aline Prado',
  'Bianca Teles',
  'Caio Viana',
  'Debora Peixoto',
  'Enzo Dantas',
  'Fernanda Leite',
  'Giovana Amaral',
  'Heitor Carvalho',
  'Iris Borges',
  'Juliana Mendes',
] as const;

const EDICOES_BASE = [
  {
    numero: 3101,
    valorCartela: 10,
    qtdNumerosCartela: 15,
    rangeInicio: 2001,
    rangeFinal: 2500,
    dataEncerramento: new Date('2026-03-11T23:59:59.000Z'),
    dataSorteio: new Date('2026-03-12T20:00:00.000Z'),
    status: StatusEdicao.FINALIZADA,
  },
  {
    numero: 3102,
    valorCartela: 12,
    qtdNumerosCartela: 15,
    rangeInicio: 2501,
    rangeFinal: 3000,
    dataEncerramento: new Date('2026-03-21T23:59:59.000Z'),
    dataSorteio: new Date('2026-03-22T20:00:00.000Z'),
    status: StatusEdicao.FINALIZADA,
  },
  {
    numero: 3103,
    valorCartela: 15,
    qtdNumerosCartela: 15,
    rangeInicio: 3001,
    rangeFinal: 3500,
    dataEncerramento: new Date('2026-03-31T23:59:59.000Z'),
    dataSorteio: new Date('2026-04-01T20:00:00.000Z'),
    status: StatusEdicao.FINALIZADA,
  },
] as const;

type SeedDistribuidor = {
  id: string;
  comissaoPercent: number;
};

type SeedVendedor = {
  id: string;
  nome: string;
  comissaoPercent: number;
};

type SeedCliente = {
  id: string;
  nome: string;
  cpf: string;
  vendedorId: string | null;
  distribuidorId: string | null;
};

type SeedEdicao = {
  id: string;
  numero: number;
  valorCartela: Prisma.Decimal;
  rangeInicio: bigint;
  rangeFinal: bigint;
};

type SeedVenda = {
  clienteId: string;
  edicaoId: string;
  vendedorId: string | null;
  distribuidorId: string;
  quantidade: number;
  total: Prisma.Decimal;
  status: StatusVenda;
  origemParticipacao: OrigemParticipacao;
  tipoPagamento: TipoPagamento;
  tipoCartela: TipoCartela;
  gatewayId: string;
  gatewayPayload: Prisma.InputJsonValue;
  createdAt: Date;
};

function createPrng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(prng: () => number, min: number, max: number): number {
  return Math.floor(prng() * (max - min + 1)) + min;
}

function randomItem<T>(prng: () => number, items: readonly T[]): T {
  return items[randomInt(prng, 0, items.length - 1)];
}

function decimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

function gerarCpfSeed(indice: number): string {
  return (92000000000 + indice + 1).toString();
}

async function limparVendasSeed(
  distribuidorId: string,
  vendedorIds: string[],
): Promise<void> {
  const vendasExistentes = await prisma.venda.findMany({
    where: {
      gatewayId: {
        startsWith: `${SEED_TAG}-`,
      },
    },
    select: {
      id: true,
      bilhetes: {
        select: {
          rangeId: true,
        },
      },
    },
  });

  if (vendasExistentes.length === 0) {
    await prisma.distribuidor.update({
      where: { id: distribuidorId },
      data: { saldo: decimal(0) },
    });

    for (const vendedorId of vendedorIds) {
      await prisma.vendedor.update({
        where: { id: vendedorId },
        data: { saldo: decimal(0) },
      });
    }

    return;
  }

  const vendaIds = vendasExistentes.map((venda) => venda.id);
  const rangeIds = vendasExistentes.flatMap((venda) =>
    venda.bilhetes.map((bilhete) => bilhete.rangeId),
  );

  await prisma.$transaction(async (tx) => {
    if (rangeIds.length > 0) {
      await tx.range.updateMany({
        where: {
          id: {
            in: rangeIds,
          },
        },
        data: {
          disponivel: true,
        },
      });
    }

    await tx.comissao.deleteMany({
      where: {
        vendaId: {
          in: vendaIds,
        },
      },
    });

    await tx.comissaoDistribuidor.deleteMany({
      where: {
        vendaId: {
          in: vendaIds,
        },
      },
    });

    await tx.bilhete.deleteMany({
      where: {
        vendaId: {
          in: vendaIds,
        },
      },
    });

    await tx.venda.deleteMany({
      where: {
        id: {
          in: vendaIds,
        },
      },
    });

    await tx.distribuidor.update({
      where: { id: distribuidorId },
      data: { saldo: decimal(0) },
    });

    for (const vendedorId of vendedorIds) {
      await tx.vendedor.update({
        where: { id: vendedorId },
        data: { saldo: decimal(0) },
      });
    }
  });
}

async function garantirRanges(): Promise<void> {
  const ranges = [];

  for (const edicao of EDICOES_BASE) {
    for (let numero = edicao.rangeInicio; numero <= edicao.rangeFinal; numero += 1) {
      const sequenciaBolas = gerarSequenciaLoterica(BigInt(numero - 1), 15, {
        seed: RANGE_SEED,
      }).numeros;

      ranges.push({
        numero: BigInt(numero),
        sequenciaBolas,
        disponivel: true,
      });
    }
  }

  for (let indice = 0; indice < ranges.length; indice += RANGE_BATCH_SIZE) {
    await prisma.range.createMany({
      data: ranges.slice(indice, indice + RANGE_BATCH_SIZE),
      skipDuplicates: true,
    });
  }

  await prisma.range.updateMany({
    where: {
      numero: {
        gte: BigInt(EDICOES_BASE[0].rangeInicio),
        lte: BigInt(EDICOES_BASE[EDICOES_BASE.length - 1].rangeFinal),
      },
    },
    data: {
      disponivel: true,
    },
  });
}

async function garantirParticipantes(): Promise<{
  distribuidor: SeedDistribuidor;
  vendedores: SeedVendedor[];
}> {
  const senhaHashDistribuidor = await bcrypt.hash(DISTRIBUIDOR_BASE.senha, 10);

  const usuarioDistribuidor = await prisma.usuario.upsert({
    where: { email: DISTRIBUIDOR_BASE.email },
    update: {
      cpf: DISTRIBUIDOR_BASE.cpf,
      perfil: Perfil.DISTRIBUIDOR,
      senhaHash: senhaHashDistribuidor,
      status: StatusUsuario.ATIVO,
    },
    create: {
      email: DISTRIBUIDOR_BASE.email,
      cpf: DISTRIBUIDOR_BASE.cpf,
      perfil: Perfil.DISTRIBUIDOR,
      senhaHash: senhaHashDistribuidor,
      status: StatusUsuario.ATIVO,
    },
  });

  const distribuidor = await prisma.distribuidor.upsert({
    where: { cpf: DISTRIBUIDOR_BASE.cpf },
    update: {
      usuarioId: usuarioDistribuidor.id,
      nome: DISTRIBUIDOR_BASE.nome,
      cpf: DISTRIBUIDOR_BASE.cpf,
      telefone: DISTRIBUIDOR_BASE.telefone,
      email: DISTRIBUIDOR_BASE.email,
      cidade: DISTRIBUIDOR_BASE.cidade,
      estado: DISTRIBUIDOR_BASE.estado,
      tipoChavePix: TipoChavePix.EMAIL,
      chavePix: DISTRIBUIDOR_BASE.email,
      comissaoPercent: decimal(DISTRIBUIDOR_BASE.comissaoPercent),
      saldo: decimal(0),
      status: StatusUsuario.ATIVO,
    },
    create: {
      usuarioId: usuarioDistribuidor.id,
      nome: DISTRIBUIDOR_BASE.nome,
      cpf: DISTRIBUIDOR_BASE.cpf,
      telefone: DISTRIBUIDOR_BASE.telefone,
      email: DISTRIBUIDOR_BASE.email,
      cidade: DISTRIBUIDOR_BASE.cidade,
      estado: DISTRIBUIDOR_BASE.estado,
      tipoChavePix: TipoChavePix.EMAIL,
      chavePix: DISTRIBUIDOR_BASE.email,
      comissaoPercent: decimal(DISTRIBUIDOR_BASE.comissaoPercent),
      saldo: decimal(0),
      status: StatusUsuario.ATIVO,
    },
  });

  const vendedores: SeedVendedor[] = [];

  for (const vendedorBase of VENDEDORES_BASE) {
    const senhaHashVendedor = await bcrypt.hash(vendedorBase.senha, 10);

    const usuarioVendedor = await prisma.usuario.upsert({
      where: { email: vendedorBase.email },
      update: {
        cpf: vendedorBase.cpf,
        perfil: Perfil.VENDEDOR,
        senhaHash: senhaHashVendedor,
        status: StatusUsuario.ATIVO,
      },
      create: {
        email: vendedorBase.email,
        cpf: vendedorBase.cpf,
        perfil: Perfil.VENDEDOR,
        senhaHash: senhaHashVendedor,
        status: StatusUsuario.ATIVO,
      },
    });

    const vendedor = await prisma.vendedor.upsert({
      where: { cpf: vendedorBase.cpf },
      update: {
        usuarioId: usuarioVendedor.id,
        distribuidorId: distribuidor.id,
        nome: vendedorBase.nome,
        cpf: vendedorBase.cpf,
        nomeRecebedor: vendedorBase.nome,
        telefone: vendedorBase.telefone,
        email: vendedorBase.email,
        cidade: vendedorBase.cidade,
        estado: vendedorBase.estado,
        tipoChavePix: TipoChavePix.CPF,
        chavePix: vendedorBase.cpf,
        comissaoPercent: decimal(vendedorBase.comissaoPercent),
        saldo: decimal(0),
        status: StatusUsuario.ATIVO,
      },
      create: {
        usuarioId: usuarioVendedor.id,
        distribuidorId: distribuidor.id,
        nome: vendedorBase.nome,
        cpf: vendedorBase.cpf,
        nomeRecebedor: vendedorBase.nome,
        telefone: vendedorBase.telefone,
        email: vendedorBase.email,
        cidade: vendedorBase.cidade,
        estado: vendedorBase.estado,
        tipoChavePix: TipoChavePix.CPF,
        chavePix: vendedorBase.cpf,
        comissaoPercent: decimal(vendedorBase.comissaoPercent),
        saldo: decimal(0),
        status: StatusUsuario.ATIVO,
      },
    });

    vendedores.push({
      id: vendedor.id,
      nome: vendedor.nome,
      comissaoPercent: Number(vendedor.comissaoPercent),
    });
  }

  return {
    distribuidor: {
      id: distribuidor.id,
      comissaoPercent: Number(distribuidor.comissaoPercent),
    },
    vendedores,
  };
}

async function garantirClientes(
  distribuidorId: string,
  vendedores: SeedVendedor[],
): Promise<SeedCliente[]> {
  const clientes: SeedCliente[] = [];

  for (let indice = 0; indice < TOTAL_CLIENTES; indice += 1) {
    const vendedor = indice % 6 === 0 ? null : vendedores[indice % vendedores.length];

    const cliente = await prisma.cliente.upsert({
      where: { cpf: gerarCpfSeed(indice) },
      update: {
        nome: NOMES_CLIENTES[indice],
        telefone: `1195000${(indice + 1).toString().padStart(4, '0')}`,
        email: `seed.cliente${(indice + 1).toString().padStart(2, '0')}@capitalpremios.com`,
        cidade: indice % 2 === 0 ? 'Sao Paulo' : 'Campinas',
        estado: 'SP',
        vendedorId: vendedor?.id ?? null,
        distribuidorId,
        status: StatusUsuario.ATIVO,
      },
      create: {
        cpf: gerarCpfSeed(indice),
        nome: NOMES_CLIENTES[indice],
        telefone: `1195000${(indice + 1).toString().padStart(4, '0')}`,
        email: `seed.cliente${(indice + 1).toString().padStart(2, '0')}@capitalpremios.com`,
        cidade: indice % 2 === 0 ? 'Sao Paulo' : 'Campinas',
        estado: 'SP',
        vendedorId: vendedor?.id ?? null,
        distribuidorId,
        status: StatusUsuario.ATIVO,
      },
    });

    clientes.push({
      id: cliente.id,
      nome: cliente.nome,
      cpf: cliente.cpf,
      vendedorId: cliente.vendedorId,
      distribuidorId: cliente.distribuidorId,
    });
  }

  return clientes;
}

async function garantirEdicoes(): Promise<SeedEdicao[]> {
  const edicoes: SeedEdicao[] = [];

  for (const edicaoBase of EDICOES_BASE) {
    const meioRange = Math.floor(
      (edicaoBase.rangeInicio + edicaoBase.rangeFinal) / 2,
    );

    const edicao = await prisma.edicao.upsert({
      where: {
        numero: edicaoBase.numero,
      },
      update: {
        dataSorteio: edicaoBase.dataSorteio,
        dataEncerramento: edicaoBase.dataEncerramento,
        valorCartela: decimal(edicaoBase.valorCartela),
        qtdNumerosCartela: edicaoBase.qtdNumerosCartela,
        rangeInicio: BigInt(edicaoBase.rangeInicio),
        rangeFinal: BigInt(edicaoBase.rangeFinal),
        qtdPremios: 3,
        destino: DestinoEdicao.AMBOS,
        frase: 'Seed de vendas de marco de 2026',
        status: edicaoBase.status,
        detalhes: {
          deleteMany: {},
          create: [
            {
              origemParticipacao: OrigemParticipacao.DIGITAL,
              tipoCartela: TipoCartela.UMA_CHANCE,
              rangeInicio: BigInt(edicaoBase.rangeInicio),
              rangeFinal: BigInt(meioRange),
            },
            {
              origemParticipacao: OrigemParticipacao.FISICO,
              tipoCartela: TipoCartela.UMA_CHANCE,
              rangeInicio: BigInt(meioRange + 1),
              rangeFinal: BigInt(edicaoBase.rangeFinal),
            },
          ],
        },
        premios: {
          deleteMany: {},
          create: [
            {
              ordem: 1,
              descricao: '1 premio',
              valor: decimal(edicaoBase.valorCartela * 500),
            },
            {
              ordem: 2,
              descricao: '2 premio',
              valor: decimal(edicaoBase.valorCartela * 250),
            },
            {
              ordem: 3,
              descricao: '3 premio',
              valor: decimal(edicaoBase.valorCartela * 125),
            },
          ],
        },
      },
      create: {
        numero: edicaoBase.numero,
        dataSorteio: edicaoBase.dataSorteio,
        dataEncerramento: edicaoBase.dataEncerramento,
        valorCartela: decimal(edicaoBase.valorCartela),
        qtdNumerosCartela: edicaoBase.qtdNumerosCartela,
        rangeInicio: BigInt(edicaoBase.rangeInicio),
        rangeFinal: BigInt(edicaoBase.rangeFinal),
        qtdPremios: 3,
        destino: DestinoEdicao.AMBOS,
        frase: 'Seed de vendas de marco de 2026',
        status: edicaoBase.status,
        detalhes: {
          create: [
            {
              origemParticipacao: OrigemParticipacao.DIGITAL,
              tipoCartela: TipoCartela.UMA_CHANCE,
              rangeInicio: BigInt(edicaoBase.rangeInicio),
              rangeFinal: BigInt(meioRange),
            },
            {
              origemParticipacao: OrigemParticipacao.FISICO,
              tipoCartela: TipoCartela.UMA_CHANCE,
              rangeInicio: BigInt(meioRange + 1),
              rangeFinal: BigInt(edicaoBase.rangeFinal),
            },
          ],
        },
        premios: {
          create: [
            {
              ordem: 1,
              descricao: '1 premio',
              valor: decimal(edicaoBase.valorCartela * 500),
            },
            {
              ordem: 2,
              descricao: '2 premio',
              valor: decimal(edicaoBase.valorCartela * 250),
            },
            {
              ordem: 3,
              descricao: '3 premio',
              valor: decimal(edicaoBase.valorCartela * 125),
            },
          ],
        },
      },
    });

    edicoes.push({
      id: edicao.id,
      numero: edicao.numero,
      valorCartela: edicao.valorCartela,
      rangeInicio: edicao.rangeInicio,
      rangeFinal: edicao.rangeFinal,
    });
  }

  return edicoes;
}

function obterEdicaoParaData(dataVenda: Date, edicoes: SeedEdicao[]): SeedEdicao {
  const dia = dataVenda.getUTCDate();

  if (dia <= 10) {
    return edicoes[0];
  }

  if (dia <= 20) {
    return edicoes[1];
  }

  return edicoes[2];
}

function gerarDataVenda(prng: () => number): Date {
  const dia = randomInt(prng, 1, 30);
  const hora = randomInt(prng, 8, 21);
  const minuto = randomInt(prng, 0, 59);
  const segundo = randomInt(prng, 0, 59);

  return new Date(Date.UTC(2026, 2, dia, hora, minuto, segundo));
}

async function criarVendaAprovada(
  venda: SeedVenda,
  vendedores: SeedVendedor[],
  distribuidor: SeedDistribuidor,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const vendaCriada = await tx.venda.create({
      data: {
        clienteId: venda.clienteId,
        edicaoId: venda.edicaoId,
        vendedorId: venda.vendedorId,
        distribuidorId: venda.distribuidorId,
        quantidade: venda.quantidade,
        total: venda.total,
        status: venda.status,
        origemParticipacao: venda.origemParticipacao,
        tipoPagamento: venda.tipoPagamento,
        tipoCartela: venda.tipoCartela,
        gatewayId: venda.gatewayId,
        gatewayPayload: venda.gatewayPayload,
        createdAt: venda.createdAt,
      },
    });

    const edicao = await tx.edicao.findUnique({
      where: { id: venda.edicaoId },
      select: {
        rangeInicio: true,
        rangeFinal: true,
      },
    });

    if (!edicao) {
      throw new Error(`Edicao ${venda.edicaoId} nao encontrada para seed`);
    }

    const rangesDisponiveis = await tx.range.findMany({
      where: {
        disponivel: true,
        numero: {
          gte: edicao.rangeInicio,
          lte: edicao.rangeFinal,
        },
      },
      orderBy: {
        numero: 'asc',
      },
      take: venda.quantidade,
    });

    if (rangesDisponiveis.length < venda.quantidade) {
      throw new Error(
        `Ranges insuficientes para a venda ${venda.gatewayId}: disponiveis=${rangesDisponiveis.length} solicitados=${venda.quantidade}`,
      );
    }

    await tx.range.updateMany({
      where: {
        id: {
          in: rangesDisponiveis.map((range) => range.id),
        },
      },
      data: {
        disponivel: false,
      },
    });

    await tx.bilhete.createMany({
      data: rangesDisponiveis.map((range) => ({
        vendaId: vendaCriada.id,
        rangeId: range.id,
        numero: range.numero,
        sequenciaBolas: range.sequenciaBolas,
      })),
    });

    const fatiaBrutaDistribuidor =
      Number(venda.total) * (distribuidor.comissaoPercent / 100);

    let comissaoVendedor = 0;

    if (venda.vendedorId) {
      const vendedor = vendedores.find((item) => item.id === venda.vendedorId);

      if (vendedor) {
        comissaoVendedor =
          fatiaBrutaDistribuidor * (vendedor.comissaoPercent / 100);

        if (comissaoVendedor > 0) {
          await tx.comissao.create({
            data: {
              vendedorId: vendedor.id,
              vendaId: vendaCriada.id,
              valor: decimal(comissaoVendedor),
              status: StatusComissao.PENDENTE,
              createdAt: venda.createdAt,
            },
          });

          await tx.vendedor.update({
            where: { id: vendedor.id },
            data: {
              saldo: {
                increment: decimal(comissaoVendedor),
              },
            },
          });
        }
      }
    }

    const comissaoDistribuidor = fatiaBrutaDistribuidor - comissaoVendedor;

    if (comissaoDistribuidor > 0) {
      await tx.comissaoDistribuidor.create({
        data: {
          distribuidorId: distribuidor.id,
          vendaId: vendaCriada.id,
          valor: decimal(comissaoDistribuidor),
          status: StatusComissao.PENDENTE,
          createdAt: venda.createdAt,
        },
      });

      await tx.distribuidor.update({
        where: { id: distribuidor.id },
        data: {
          saldo: {
            increment: decimal(comissaoDistribuidor),
          },
        },
      });
    }
  });
}

async function main(): Promise<void> {
  console.log('🌱 Iniciando seed de vendas de marco de 2026...');

  const participantes = await garantirParticipantes();
  await limparVendasSeed(
    participantes.distribuidor.id,
    participantes.vendedores.map((vendedor) => vendedor.id),
  );
  await garantirRanges();
  const edicoes = await garantirEdicoes();
  const clientes = await garantirClientes(
    participantes.distribuidor.id,
    participantes.vendedores,
  );

  const prng = createPrng(202603);

  for (let indice = 0; indice < TOTAL_VENDAS; indice += 1) {
    const dataVenda = gerarDataVenda(prng);
    const edicao = obterEdicaoParaData(dataVenda, edicoes);
    const cliente = randomItem(prng, clientes);
    const vendedor =
      prng() < 0.28 ? null : randomItem(prng, participantes.vendedores);
    const quantidade = randomInt(prng, 1, 4);
    const tipoPagamento =
      prng() < 0.78 ? TipoPagamento.PIX : TipoPagamento.CARTAO;
    const origemParticipacao = randomItem(prng, [
      OrigemParticipacao.DIGITAL,
      OrigemParticipacao.FISICO,
      OrigemParticipacao.POS,
    ]);

    await criarVendaAprovada(
      {
        clienteId: cliente.id,
        edicaoId: edicao.id,
        vendedorId: vendedor?.id ?? null,
        distribuidorId: participantes.distribuidor.id,
        quantidade,
        total: decimal(quantidade * Number(edicao.valorCartela)),
        status: StatusVenda.APROVADO,
        origemParticipacao,
        tipoPagamento,
        tipoCartela: TipoCartela.UMA_CHANCE,
        gatewayId: `${SEED_TAG}-${(indice + 1).toString().padStart(3, '0')}`,
        gatewayPayload: {
          seedTag: SEED_TAG,
          referencia: `MARCO-2026-${(indice + 1).toString().padStart(3, '0')}`,
          cliente: cliente.nome,
          clienteCpf: cliente.cpf,
          edicaoNumero: edicao.numero,
          tipoPagamento,
          origemParticipacao,
        },
        createdAt: dataVenda,
      },
      participantes.vendedores,
      participantes.distribuidor,
    );
  }

  console.log(`✅ ${TOTAL_VENDAS} vendas aprovadas criadas com sucesso.`);
  console.log('📅 Periodo: 01/03/2026 a 30/03/2026');
  console.log(`🏷️  Tag do seed: ${SEED_TAG}`);
  console.log(`📧 Distribuidor: ${DISTRIBUIDOR_BASE.email} / ${DISTRIBUIDOR_BASE.senha}`);
  console.log(`📧 Vendedor 1: ${VENDEDORES_BASE[0].email} / ${VENDEDORES_BASE[0].senha}`);
  console.log(`📧 Vendedor 2: ${VENDEDORES_BASE[1].email} / ${VENDEDORES_BASE[1].senha}`);
}

main()
  .catch((error: unknown) => {
    console.error('❌ Erro no seed de vendas:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
