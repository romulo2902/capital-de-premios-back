# Sorteio Frontend Guide

Guia unico para o frontend implementar todo o fluxo de sorteio, incluindo estado inicial via API e atualizacoes em tempo real via Firebase Firestore.

## 1) Resumo da arquitetura

- O backend (NestJS) persiste a verdade do sorteio no PostgreSQL/Prisma.
- O backend tambem sincroniza os eventos no Firebase Firestore.
- O frontend consome:
  - estado inicial via API REST
  - atualizacoes em tempo real via `onSnapshot` no Firestore.
- WebSocket nao e utilizado.

## 2) Real time ou Firestore?

- E Firestore em tempo real.
- Em termos praticos: o canal de atualizacao ao vivo no front e o listener do Firestore (`onSnapshot`).

## 3) Status da edicao (ciclo de vida)

Status existentes no sistema:

- `RASCUNHO`
- `ATIVA`
- `ENCERRADA`
- `SORTEANDO`
- `FINALIZADA`

Transicoes relevantes para o front:

1. `RASCUNHO -> ATIVA`
- Vendas permitidas na loja publica.

2. `ATIVA -> ENCERRADA`
- Vendas encerradas.
- Pre-condicao para iniciar apuracao no sorteio.

3. `ENCERRADA -> SORTEANDO`
- Admin iniciou sorteio.
- Front deve exibir tela de sorteio ao vivo.

4. `SORTEANDO -> FINALIZADA`
- Sorteio concluido.
- Front pode travar marcacao visual e exibir resultado final.

Observacao importante:
- No Firestore, o campo `estado` e um resumo do sorteio em tempo real:
  - `em_andamento`
  - `finalizado`
  - `aguardando` (previsto no contrato, pode existir em cenarios de preparo)

## 4) Endpoints que o frontend usa

Base: `/api`

### 4.1 Loja/Publico (leitura)

1. Estado atual do sorteio
- `GET /loja/sorteio/:edicaoId/estado`
- Uso: hidratar tela antes de iniciar listeners do Firestore.

2. Bilhetes do cliente autenticado para a edicao
- `GET /loja/sorteio/:edicaoId/meus-bilhetes`
- Requer JWT.
- Uso: montar cartelas do cliente para destacar acertos durante a transmissao.

### 4.2 Admin (acao do operador)

1. Iniciar sorteio
- `POST /admin/sorteio/:edicaoId/iniciar`

2. Marcar numero em premio
- `POST /admin/sorteio/:edicaoId/premio/:premioId/marcar`
- Body:
```json
{ "numero": 7 }
```

3. Desmarcar numero em premio
- `POST /admin/sorteio/:edicaoId/premio/:premioId/desmarcar`
- Body:
```json
{ "numero": 7 }
```

4. Finalizar sorteio
- `POST /admin/sorteio/:edicaoId/finalizar`

## 5) Contratos de dados para o frontend

## 5.1 Resposta de estado do sorteio (API)

Endpoint: `GET /loja/sorteio/:edicaoId/estado`

```json
{
  "statusCode": 200,
  "message": "Operacao realizada",
  "data": {
    "edicaoId": "uuid",
    "edicaoNumero": 123,
    "status": "SORTEANDO",
    "premios": [
      {
        "premioId": "uuid",
        "ordem": 1,
        "descricao": "1o Premio",
        "valor": "5000.00",
        "numerosMarcados": [7, 12, 25],
        "ganhador": {
          "bilheteNumero": "1234567",
          "clienteNome": "Maria"
        }
      }
    ]
  }
}
```

Notas:
- `valor` vem como string.
- `ganhador` pode ser `null`.
- `numerosMarcados` e por premio.

## 5.2 Resposta de bilhetes do cliente

Endpoint: `GET /loja/sorteio/:edicaoId/meus-bilhetes`

```json
{
  "statusCode": 200,
  "message": "Bilhetes encontrados",
  "data": [
    {
      "bilheteId": "uuid",
      "numero": "1234567",
      "sequenciaBolas": [3, 7, 12, 18, 25, 31, 39, 44, 48, 50, 2, 5, 9, 14, 20]
    }
  ]
}
```

## 6) Estrutura no Firestore

Colecao raiz:

- `sorteios/{edicaoId}`

Documento de status do sorteio:

```json
{
  "estado": "em_andamento",
  "edicaoNumero": 123,
  "totalPremios": 5,
  "updatedAt": "serverTimestamp"
}
```

Subcolecao por premio:

- `sorteios/{edicaoId}/premios/{premioId}`

```json
{
  "ordem": 1,
  "descricao": "1o Premio",
  "numerosMarcados": [7, 12, 25],
  "ultimoNumero": 25,
  "ganhador": {
    "bilheteNumero": "1234567",
    "clienteNome": "Maria"
  },
  "updatedAt": "serverTimestamp"
}
```

Notas:
- `ganhador` pode ser `null`.
- `ultimoNumero` pode ser `null`.
- O backend escreve com `merge=true` e `updatedAt` automatico.

## 7) Sequencia recomendada no frontend

1. Abrir pagina de sorteio com `edicaoId`.
2. Buscar `GET /loja/sorteio/:edicaoId/estado`.
3. Se usuario autenticado, buscar `GET /loja/sorteio/:edicaoId/meus-bilhetes`.
4. Renderizar estado inicial da tela.
5. Iniciar listeners do Firestore:
   - doc `sorteios/{edicaoId}`
   - collection `sorteios/{edicaoId}/premios`
6. A cada update:
   - atualizar status visual
   - atualizar numeros marcados por premio
   - recalcular acertos por bilhete localmente
7. No unmount da tela: remover todos os listeners.

## 8) Exemplo de listener (Firebase Web SDK)

```ts
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, collection, onSnapshot } from 'firebase/firestore';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export function subscribeSorteio(edicaoId: string, handlers: {
  onStatus: (statusDoc: any | null) => void;
  onPremios: (premios: Array<Record<string, unknown>>) => void;
  onError?: (error: unknown) => void;
}) {
  const sorteioRef = doc(db, 'sorteios', edicaoId);
  const premiosRef = collection(db, 'sorteios', edicaoId, 'premios');

  const unsubStatus = onSnapshot(
    sorteioRef,
    (snap) => handlers.onStatus(snap.exists() ? snap.data() : null),
    (error) => handlers.onError?.(error),
  );

  const unsubPremios = onSnapshot(
    premiosRef,
    (snap) => {
      const premios = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      premios.sort((a, b) => Number(a.ordem) - Number(b.ordem));
      handlers.onPremios(premios);
    },
    (error) => handlers.onError?.(error),
  );

  return () => {
    unsubStatus();
    unsubPremios();
  };
}
```

## 9) Regras de UI que evitam bug

1. Sempre carregar estado inicial pela API antes do Firestore.
2. Nao assumir ordem dos docs da subcolecao, ordenar por `ordem` no front.
3. Tratar `ganhador` como opcional (`null`).
4. Tratar reconexao de rede sem resetar a tela inteira.
5. Se Firestore atrasar, manter ultimo estado valido em memoria.
6. Bloquear acoes de admin quando status nao for compativel.

## 10) Erros comuns e tratamento

1. `400` ao iniciar sorteio
- Causa comum: edicao nao esta `ENCERRADA`.

2. `400` ao marcar/desmarcar
- Causa comum: edicao nao esta `SORTEANDO`.

3. `404` premio ou edicao
- Causa comum: `edicaoId`/`premioId` invalido ou nao pertence a edicao.

4. `409` ao marcar numero
- Causa comum: numero ja marcado no premio, ou premio ja tem ganhador.

## 11) Checklist de implementacao do front

- Tela de estado inicial do sorteio (loading/hidratacao).
- Listener de status geral (`sorteios/{edicaoId}`).
- Listener de premios (`sorteios/{edicaoId}/premios`).
- Render de numeros marcados por premio em tempo real.
- Render de ganhador por premio quando existir.
- Tela de bilhetes do cliente e destaque de acertos.
- Tratamento de reconexao/offline.
- Cleanup dos listeners no unmount.

## 12) Variaveis e credenciais

No backend:
- `FIREBASE_SERVICE_ACCOUNT_PATH` precisa estar configurado para o Admin SDK escrever no Firestore.

No frontend:
- Config normal do Firebase Client SDK para leitura em tempo real.
- Regras de seguranca do Firestore devem permitir leitura do caminho de sorteio para os clientes autorizados pelo produto.
