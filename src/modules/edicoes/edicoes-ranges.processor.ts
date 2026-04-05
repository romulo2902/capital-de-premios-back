import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EDICAO_RANGES_JOB_NAME,
  EDICOES_RANGES_QUEUE,
} from './edicoes-ranges.constants';
import {
  criarContextoSequenciaLotericaDeterministico,
  gerarSequenciaLoterica,
  obterTotalCombinacoesCartela,
} from './edicoes-sequencia.util';

interface GerarRangesEdicaoJobData {
  edicaoId: string;
}

const RANGE_BATCH_SIZE = 5000n;

@Processor(EDICOES_RANGES_QUEUE)
export class EdicoesRangesProcessor extends WorkerHost {
  private readonly logger = new Logger(EdicoesRangesProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<GerarRangesEdicaoJobData>): Promise<void> {
    if (job.name !== EDICAO_RANGES_JOB_NAME) {
      this.logger.warn(`Job desconhecido ignorado: ${job.name}`);
      return;
    }

    const { edicaoId } = job.data;
    const edicao = await this.prisma.edicao.findUnique({
      where: { id: edicaoId },
      include: {
        detalhes: {
          orderBy: { rangeInicio: 'asc' },
        },
      },
    });

    if (!edicao) {
      this.logger.warn(`Edição ${edicaoId} não encontrada para geração de ranges`);
      return;
    }

    const totalCartelas = edicao.detalhes.reduce(
      (total, detalhe) =>
        total + (detalhe.rangeFinal - detalhe.rangeInicio + BigInt(1)),
      0n,
    );
    const totalCombinacoes = obterTotalCombinacoesCartela(edicao.qtdNumerosCartela);

    if (totalCartelas > totalCombinacoes) {
      throw new Error(
        `A edição ${edicao.numero} exige ${totalCartelas.toString()} cartelas, mas só existem ${totalCombinacoes.toString()} combinações únicas possíveis para ${edicao.qtdNumerosCartela} números entre 1 e 50`,
      );
    }

    let indiceGlobal = 0n;
    const contextoSequencia = criarContextoSequenciaLotericaDeterministico(
      `${edicao.id}:${edicao.numero}:${edicao.qtdNumerosCartela}`,
    );

    this.logger.log(
      `Geração auditável da edição ${edicao.numero}: sorteioId=${contextoSequencia.sorteioId} timestamp=${contextoSequencia.timestamp}`,
    );

    for (const detalhe of edicao.detalhes) {
      const totalDetalhe = detalhe.rangeFinal - detalhe.rangeInicio + BigInt(1);
      this.logger.log(
        `Gerando ranges da edição ${edicao.numero} para ${detalhe.rangeInicio.toString()}-${detalhe.rangeFinal.toString()} (${totalDetalhe.toString()} registros)`,
      );

      let inicioLote = detalhe.rangeInicio;

      while (inicioLote <= detalhe.rangeFinal) {
        const fimLote =
          inicioLote + RANGE_BATCH_SIZE - BigInt(1) <= detalhe.rangeFinal
            ? inicioLote + RANGE_BATCH_SIZE - BigInt(1)
            : detalhe.rangeFinal;

        const valores: Prisma.Sql[] = [];

        for (let numero = inicioLote; numero <= fimLote; numero += BigInt(1)) {
          const sequencia = gerarSequenciaLoterica(
            indiceGlobal,
            edicao.qtdNumerosCartela,
            { contexto: contextoSequencia },
          ).numeros;
          valores.push(
            Prisma.sql`(gen_random_uuid(), ${numero}, ARRAY[${Prisma.join(sequencia)}]::int[], true)`,
          );
          indiceGlobal += 1n;
        }

        await this.prisma.$executeRaw(
          Prisma.sql`
            INSERT INTO "Range" (id, numero, "sequenciaBolas", disponivel)
            VALUES ${Prisma.join(valores)}
            ON CONFLICT (numero) DO UPDATE
            SET "sequenciaBolas" = EXCLUDED."sequenciaBolas"
          `,
        );

        this.logger.log(
          `Ranges processados para edição ${edicao.numero}: ${inicioLote.toString()}-${fimLote.toString()}`,
        );

        inicioLote = fimLote + BigInt(1);
      }
    }

    this.logger.log(`Geração de ranges concluída para edição ${edicao.numero}`);
  }
}
