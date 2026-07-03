import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertConfiguracaoComissaoDto } from './dto/upsert-configuracao-comissao.dto';
import { Prisma } from '@prisma/client';

const CHAVE_PADRAO = 'DEFAULT';

@Injectable()
export class ConfiguracaoComissaoService {
  private readonly logger = new Logger(ConfiguracaoComissaoService.name);

  constructor(private readonly prisma: PrismaService) {}

  async obter() {
    this.logger.log('Buscando configuração global de comissão');

    const config = await this.prisma.configuracaoComissao.upsert({
      where: { chave: CHAVE_PADRAO },
      create: { chave: CHAVE_PADRAO },
      update: {},
    });

    return {
      message: 'Configuração de comissão obtida com sucesso',
      data: {
        percentualDistribuidor: Number(config.percentualDistribuidor),
        percentualVendedor: Number(config.percentualVendedor),
        updatedAt: config.updatedAt,
      },
    };
  }

  async atualizar(dto: UpsertConfiguracaoComissaoDto) {
    this.logger.log(
      `Atualizando configuração global de comissão: distribuidor=${dto.percentualDistribuidor}%, vendedor=${dto.percentualVendedor}%`,
    );

    const config = await this.prisma.configuracaoComissao.upsert({
      where: { chave: CHAVE_PADRAO },
      create: {
        chave: CHAVE_PADRAO,
        percentualDistribuidor: new Prisma.Decimal(dto.percentualDistribuidor),
        percentualVendedor: new Prisma.Decimal(dto.percentualVendedor),
      },
      update: {
        percentualDistribuidor: new Prisma.Decimal(dto.percentualDistribuidor),
        percentualVendedor: new Prisma.Decimal(dto.percentualVendedor),
      },
    });

    return {
      message: 'Configuração de comissão atualizada com sucesso',
      data: {
        percentualDistribuidor: Number(config.percentualDistribuidor),
        percentualVendedor: Number(config.percentualVendedor),
        updatedAt: config.updatedAt,
      },
    };
  }

  /**
   * Retorna a configuração global como números simples.
   * Usado internamente por outros serviços (ex: VendasService).
   */
  async obterConfiguracaoGlobal(): Promise<{
    percentualDistribuidor: number;
    percentualVendedor: number;
  }> {
    const config = await this.prisma.configuracaoComissao.upsert({
      where: { chave: CHAVE_PADRAO },
      create: { chave: CHAVE_PADRAO },
      update: {},
    });

    return {
      percentualDistribuidor: Number(config.percentualDistribuidor),
      percentualVendedor: Number(config.percentualVendedor),
    };
  }
}
