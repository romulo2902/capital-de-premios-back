import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import {
  ModoAtualizacaoQrcode,
  QrcodeService,
} from '../modules/qrcode/qrcode.service';

const FLAG_CRIAR_AUSENTES = '--somente-ausentes';
const FLAG_RECRIAR_TODOS = '--recriar-todos';

function resolverModo(args: string[]): ModoAtualizacaoQrcode {
  const flagsConhecidas = new Set([FLAG_CRIAR_AUSENTES, FLAG_RECRIAR_TODOS]);
  const flagsDesconhecidas = args.filter((arg) => !flagsConhecidas.has(arg));

  if (flagsDesconhecidas.length > 0) {
    throw new Error(`Opção desconhecida: ${flagsDesconhecidas.join(', ')}`);
  }

  if (args.includes(FLAG_CRIAR_AUSENTES) && args.includes(FLAG_RECRIAR_TODOS)) {
    throw new Error('Informe apenas um modo de atualização de QR Codes');
  }

  return args.includes(FLAG_RECRIAR_TODOS)
    ? ModoAtualizacaoQrcode.RECRIAR_TODOS
    : ModoAtualizacaoQrcode.CRIAR_AUSENTES;
}

async function bootstrap(): Promise<void> {
  const modo = resolverModo(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const qrcodeService = app.get(QrcodeService, { strict: false });
    const resultado = await qrcodeService.atualizarLinksEQrcodesSellers(modo);

    console.log(`Backfill de links e QR Codes finalizado (${resultado.modo})`);
    console.log(`Vendedores atualizados: ${resultado.vendedoresAtualizados}`);
    console.log(`Vendedores preservados: ${resultado.vendedoresPreservados}`);
    console.log(
      `Distribuidores atualizados: ${resultado.distribuidoresAtualizados}`,
    );
    console.log(
      `Distribuidores preservados: ${resultado.distribuidoresPreservados}`,
    );

    if (resultado.erros.length > 0) {
      console.log(`Erros: ${resultado.erros.length}`);
      for (const erro of resultado.erros) {
        console.log(`[${erro.tipo}] ${erro.id}: ${erro.motivo}`);
      }

      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

void bootstrap().catch((error: unknown) => {
  console.error(
    `Falha ao atualizar links e QR Codes: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
});
