import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { QrcodeService } from '../modules/qrcode/qrcode.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const qrcodeService = app.get(QrcodeService, { strict: false });
    const resultado = await qrcodeService.atualizarLinksEQrcodesSellers();

    console.log('Backfill de links e QR Codes finalizado');
    console.log(`Vendedores atualizados: ${resultado.vendedoresAtualizados}`);
    console.log(
      `Distribuidores atualizados: ${resultado.distribuidoresAtualizados}`,
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
