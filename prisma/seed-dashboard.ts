import { PrismaClient, Perfil, StatusVenda, OrigemParticipacao, TipoPagamento, DestinoEdicao, StatusEdicao, TipoCartela } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando Seed do Dashboard...');

  const senhaHash = await bcrypt.hash('123456', 10);

  // 1. Criar ou Obter Usuários Bases
  console.log('Criando distribuidor e vendedor fictícios...');
  
  const distribuidorUser = await prisma.usuario.upsert({
    where: { email: 'distribuidor.dash@exemplo.com' },
    update: {},
    create: {
      email: 'distribuidor.dash@exemplo.com',
      cpf: '11111111111',
      perfil: Perfil.DISTRIBUIDOR,
      senhaHash,
    },
  });

  const distribuidor = await prisma.distribuidor.upsert({
    where: { cpf: '11111111111' },
    update: {},
    create: {
      usuarioId: distribuidorUser.id,
      nome: 'Distribuidor Dashboard',
      cpf: '11111111111',
      email: 'distribuidor.dash@exemplo.com',
      telefone: '11999999999',
    },
  });

  const vendedorUser = await prisma.usuario.upsert({
    where: { email: 'vendedor.dash@exemplo.com' },
    update: {},
    create: {
      email: 'vendedor.dash@exemplo.com',
      cpf: '22222222222',
      perfil: Perfil.VENDEDOR,
      senhaHash,
    },
  });

  const vendedor = await prisma.vendedor.upsert({
    where: { cpf: '22222222222' },
    update: {},
    create: {
      usuarioId: vendedorUser.id,
      distribuidorId: distribuidor.id,
      nome: 'Vendedor Dashboard',
      cpf: '22222222222',
      email: 'vendedor.dash@exemplo.com',
      telefone: '11888888888',
      comissaoPercent: 10,
    },
  });

  const cliente = await prisma.cliente.upsert({
    where: { cpf: '33333333333' },
    update: {},
    create: {
      nome: 'Cliente Dashboard',
      cpf: '33333333333',
      telefone: '11777777777',
      vendedorId: vendedor.id,
      distribuidorId: distribuidor.id,
    },
  });

  // 2. Criar Edições Variadas
  console.log('Criando edições...');
  const edicoes = [];
  for (let i = 1; i <= 5; i++) {
    const ed = await prisma.edicao.upsert({
      where: { numero: 1000 + i },
      update: {},
      create: {
        numero: 1000 + i,
        dataSorteio: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7 * i),
        dataEncerramento: new Date(Date.now() + 1000 * 60 * 60 * 24 * 6 * i),
        valorCartela: 10,
        qtdNumerosCartela: 15,
        rangeInicio: 1,
        rangeFinal: 100000,
        qtdPremios: 5,
        destino: DestinoEdicao.SITE,
        status: i === 1 ? StatusEdicao.ATIVA : StatusEdicao.RASCUNHO,
        detalhes: {
          create: {
            origemParticipacao: OrigemParticipacao.DIGITAL,
            tipoCartela: TipoCartela.UMA_CHANCE,
            rangeInicio: 1,
            rangeFinal: 100000,
          }
        }
      },
    });
    edicoes.push(ed);
  }

  // 3. Espalhar dezenas de vendas entre as datas passadas
  console.log('Gerando dezenas de vendas espalhadas nos últimos 30 dias...');
  const vendasCriadas = [];
  for (let i = 0; i < 90; i++) {
    // Data aleatória entre hoje e 30 dias atrás
    const diasAtras = Math.floor(Math.random() * 30);
    const dataCriacao = new Date();
    dataCriacao.setDate(dataCriacao.getDate() - diasAtras);
    
    // Escolhe edição pseudo-aleatória das 5
    const edicaoSelec = edicoes[Math.floor(Math.random() * edicoes.length)];
    const qtd = Math.floor(Math.random() * 5) + 1;

    vendasCriadas.push({
      edicaoId: edicaoSelec.id,
      clienteId: cliente.id,
      vendedorId: vendedor.id,   // <- Liga ao Vendedor
      distribuidorId: distribuidor.id, // <- Liga ao Distribuidor
      quantidade: qtd,
      total: qtd * Number(edicaoSelec.valorCartela),
      status: StatusVenda.APROVADO,
      origemParticipacao: OrigemParticipacao.DIGITAL,
      tipoPagamento: TipoPagamento.PIX,
      createdAt: dataCriacao,
    });
  }

  const { count } = await prisma.venda.createMany({
    data: vendasCriadas,
  });

  console.log(`✅ ${count} vendas injetadas!`);
  console.log('📈 O Dashboard de Admin, Distribuidor e Vendedor já deve mostrar volume nos gráficos!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
