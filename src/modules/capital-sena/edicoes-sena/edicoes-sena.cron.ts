import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { StatusEdicaoSena } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class EdicoesSenaCronService {
  private readonly logger = new Logger(EdicoesSenaCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async gerenciarCicloDeVida(): Promise<void> {
    // Em cluster PM2 (instances: 'max'), cada worker registra a mesma cron;
    // restringe a execução à instância 0 para não encerrar/ativar em paralelo.
    const instancia = this.config.get<string>('NODE_APP_INSTANCE');
    if (instancia && instancia !== '0') return;

    await this.encerrarExpiradas();
    await this.ativarProximaRascunho();
  }

  private async encerrarExpiradas(): Promise<void> {
    const agora = new Date();
    const { count } = await this.prisma.edicaoSena.updateMany({
      where: {
        status: StatusEdicaoSena.ATIVA,
        dataEncerramento: { lt: agora },
      },
      data: { status: StatusEdicaoSena.ENCERRADA },
    });

    if (count > 0) {
      this.logger.log(
        `${count} edição(ões) Sena encerrada(s) automaticamente (dataEncerramento expirada)`,
      );
    }
  }

  private async ativarProximaRascunho(): Promise<void> {
    const agora = new Date();

    const existeAtiva = await this.prisma.edicaoSena.findFirst({
      where: { status: StatusEdicaoSena.ATIVA },
      select: { id: true },
    });
    if (existeAtiva) return;

    const proximaRascunho = await this.prisma.edicaoSena.findFirst({
      where: {
        status: StatusEdicaoSena.RASCUNHO,
        dataSorteioMegaSena: { gt: agora },
      },
      orderBy: { dataSorteioMegaSena: 'asc' },
    });
    if (!proximaRascunho) return;

    await this.prisma.edicaoSena.update({
      where: { id: proximaRascunho.id },
      data: { status: StatusEdicaoSena.ATIVA },
    });

    this.logger.log(
      `Edição Sena "${proximaRascunho.numero}" ativada automaticamente (RASCUNHO -> ATIVA)`,
    );
  }
}
