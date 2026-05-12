import { PrismaClient, OrigemParticipacao, TipoCartela } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });
const prisma = new PrismaClient();

async function main() {
  const edicao = await prisma.edicao.findFirst({ where: { status: 'ATIVA' } });
  if (!edicao) {
    console.log('Erro: Nenhuma edicao ativa para adicionar combos.');
    return;
  }
  
  const combos = [
    { tipo: TipoCartela.TRES_CHANCES, preco: 25.00 },
    { tipo: TipoCartela.CINCO_CHANCES, preco: 40.00 },
    { tipo: TipoCartela.DEZ_CHANCES, preco: 70.00 }
  ];

  for (const c of combos) {
    await prisma.edicaoCombo.upsert({
      where: {
        edicaoId_origemParticipacao_tipoCartela: {
          edicaoId: edicao.id,
          origemParticipacao: OrigemParticipacao.DIGITAL,
          tipoCartela: c.tipo
        }
      },
      update: { preco: c.preco },
      create: {
        edicaoId: edicao.id,
        origemParticipacao: OrigemParticipacao.DIGITAL,
        tipoCartela: c.tipo,
        preco: c.preco
      }
    });
  }
  console.log(`✅ Combos criados para a edicao: ${edicao.numero}`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
