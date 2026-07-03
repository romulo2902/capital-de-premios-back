import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateEdicaoDto } from '../src/modules/edicoes/dto/create-edicao.dto';

const payload = {
  "numero": "ABC-2026-002",
  "dataSorteio": "2026-05-29T00:42",
  "dataEncerramento": "2026-05-28T21:42",
  "frase": "teste",
  "destino": "AMBOS",
  "raspadinha": false,
  "manutencaoAtiva": false,
  "manutencaoMensagem": "",
  "valorCartela": "15.00",
  "combos": [
    {
      "origemParticipacao": "DIGITAL",
      "quantidadeCartelas": 3,
      "preco": "40.00"
    }
  ],
  "premios": [
    {
      "descricao": "Moto",
      "valor": "7500.00",
      "imagemBase64": "data:image/png;base64,iVBORw0K"
    }
  ]
};

async function run() {
  const dto = plainToInstance(CreateEdicaoDto, payload);
  console.log("DTO:", JSON.stringify(dto, null, 2));
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  console.log("Errors:", errors.length > 0 ? errors.map(e => e.property) : "None");
}

run();
