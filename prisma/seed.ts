import { PrismaClient, Perfil, StatusUsuario, StatusEdicao } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Iniciando seed do banco de dados...');

  // 1. Admin
  const senhaHash = await bcrypt.hash('Admin@123', 10);
  const adminUsuario = await prisma.usuario.upsert({
    where: { email: 'admin@capitalpremios.com' },
    update: {},
    create: {
      email: 'admin@capitalpremios.com',
      senhaHash,
      perfil: Perfil.ADMIN,
      status: StatusUsuario.ATIVO,
    },
  });
  console.log('✅ Admin criado:', adminUsuario.email);

  // 2. Distribuidor
  const distUsuario = await prisma.usuario.upsert({
    where: { email: 'distribuidor@capitalpremios.com' },
    update: {},
    create: {
      email: 'distribuidor@capitalpremios.com',
      senhaHash: await bcrypt.hash('Dist@123', 10),
      perfil: Perfil.DISTRIBUIDOR,
      status: StatusUsuario.ATIVO,
    },
  });

  const distribuidor = await prisma.distribuidor.upsert({
    where: { usuarioId: distUsuario.id },
    update: {},
    create: {
      usuarioId: distUsuario.id,
      nome: 'Distribuidora Norte',
      cpf: '11122233344',
      telefone: '(11) 99000-0001',
      email: 'distribuidor@capitalpremios.com',
      cidade: 'São Paulo',
      estado: 'SP',
      link: 'http://localhost:3001?dist=norte',
      status: StatusUsuario.ATIVO,
    },
  });
  console.log('✅ Distribuidor criado:', distribuidor.nome);

  // 3. Vendedores
  const vendedor1Usuario = await prisma.usuario.upsert({
    where: { email: 'vendedor1@capitalpremios.com' },
    update: {},
    create: {
      email: 'vendedor1@capitalpremios.com',
      senhaHash: await bcrypt.hash('Vend@123', 10),
      perfil: Perfil.VENDEDOR,
      status: StatusUsuario.ATIVO,
    },
  });

  const vendedor1 = await prisma.vendedor.upsert({
    where: { usuarioId: vendedor1Usuario.id },
    update: {},
    create: {
      usuarioId: vendedor1Usuario.id,
      distribuidorId: distribuidor.id,
      nome: 'João Vendedor',
      codigo: 'VEND001',
      comissaoPercent: 5,
      telefone: '(11) 98000-0001',
      email: 'vendedor1@capitalpremios.com',
      cidade: 'São Paulo',
      estado: 'SP',
      status: StatusUsuario.ATIVO,
    },
  });
  console.log('✅ Vendedor 1 criado:', vendedor1.nome);

  const vendedor2Usuario = await prisma.usuario.upsert({
    where: { email: 'vendedor2@capitalpremios.com' },
    update: {},
    create: {
      email: 'vendedor2@capitalpremios.com',
      senhaHash: await bcrypt.hash('Vend@123', 10),
      perfil: Perfil.VENDEDOR,
      status: StatusUsuario.ATIVO,
    },
  });

  await prisma.vendedor.upsert({
    where: { usuarioId: vendedor2Usuario.id },
    update: {},
    create: {
      usuarioId: vendedor2Usuario.id,
      distribuidorId: distribuidor.id,
      nome: 'Maria Vendedora',
      codigo: 'VEND002',
      comissaoPercent: 5,
      telefone: '(11) 98000-0002',
      email: 'vendedor2@capitalpremios.com',
      cidade: 'Campinas',
      estado: 'SP',
      status: StatusUsuario.ATIVO,
    },
  });
  console.log('✅ Vendedor 2 criado: Maria Vendedora');

  // 4. Clientes
  const clientes = [
    { cpf: '11111111111', nome: 'Carlos Cliente', telefone: '(11) 97000-0001', cidade: 'São Paulo', estado: 'SP' },
    { cpf: '22222222222', nome: 'Ana Cliente', telefone: '(21) 97000-0002', cidade: 'Rio de Janeiro', estado: 'RJ' },
    { cpf: '33333333333', nome: 'Pedro Cliente', telefone: '(31) 97000-0003', cidade: 'Belo Horizonte', estado: 'MG' },
  ];

  for (const clienteData of clientes) {
    await prisma.cliente.upsert({
      where: { cpf: clienteData.cpf },
      update: {},
      create: { ...clienteData, status: StatusUsuario.ATIVO },
    });
  }
  console.log('✅ 3 clientes criados');

  // 5. Edição ativa de exemplo
  const edicao = await prisma.edicao.upsert({
    where: { numero: 1 },
    update: {},
    create: {
      numero: 1,
      dataSorteio: new Date('2025-03-01T20:00:00.000Z'),
      dataEncerramento: new Date('2025-02-28T23:59:59.000Z'),
      valorCartela: 10.00,
      rangeInicio: BigInt(1),
      rangeFinal: BigInt(100000),
      qtdPremios: 3,
      especie: 'Dinheiro',
      status: StatusEdicao.ATIVA,
      premios: {
        create: [
          { ordem: 1, descricao: '1º Prêmio', valor: 5000.00 },
          { ordem: 2, descricao: '2º Prêmio', valor: 2000.00 },
          { ordem: 3, descricao: '3º Prêmio', valor: 1000.00 },
        ],
      },
    },
  });
  console.log('✅ Edição #1 criada (ATIVA)');

  // 6. Ranges (1.000 registros com sequenciaBolas aleatória)
  console.log('⏳ Criando 1.000 ranges...');
  const TOTAL_RANGES = 1000;
  const BATCH_SIZE = 100;

  // Check existing ranges to avoid duplicates
  const existingCount = await prisma.range.count();
  if (existingCount < TOTAL_RANGES) {
    const lastExisting = await prisma.range.findFirst({ orderBy: { numero: 'desc' } });
    const startNum = lastExisting ? Number(lastExisting.numero) + 1 : 1;

    for (let batch = 0; batch < TOTAL_RANGES / BATCH_SIZE; batch++) {
      const ranges = [];
      for (let i = 0; i < BATCH_SIZE; i++) {
        const numero = startNum + batch * BATCH_SIZE + i;
        const sequenciaBolas = gerarSequenciaBolas();
        ranges.push({ numero: BigInt(numero), sequenciaBolas, disponivel: true });
      }
      await prisma.range.createMany({ data: ranges, skipDuplicates: true });
    }
    console.log(`✅ ${TOTAL_RANGES} ranges criados`);
  } else {
    console.log('ℹ️  Ranges já existem, pulando...');
  }

  console.log('\n🎉 Seed concluído com sucesso!');
  console.log('\n📋 Credenciais de acesso:');
  console.log('  Admin:        admin@capitalpremios.com / Admin@123');
  console.log('  Distribuidor: distribuidor@capitalpremios.com / Dist@123');
  console.log('  Vendedor 1:   vendedor1@capitalpremios.com / Vend@123');
  console.log('  Vendedor 2:   vendedor2@capitalpremios.com / Vend@123');
}

function gerarSequenciaBolas(): number[] {
  // Gera sequência de 2 bolas aleatórias (0-9)
  const bolas: number[] = [];
  let num = Math.floor(Math.random() * 10000);
  while (num > 0) {
    bolas.unshift(num % 10);
    num = Math.floor(num / 10);
  }
  // Ensure at least 2 bolas
  while (bolas.length < 2) bolas.unshift(0);
  return bolas;
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
