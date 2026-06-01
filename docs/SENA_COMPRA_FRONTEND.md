# Capital Sena — Guia de Compra (Frontend)

Documento de referência para o frontend (loja, painel admin, app POS) sobre como montar o payload de criação de venda Sena.

> **Importante**: o backend agora aceita **4 cenários** no mesmo endpoint. O DTO foi tornado mais flexível e é **100% retrocompatível** — payloads antigos continuam funcionando.

---

## Endpoints

| Contexto | Método | Rota | Autenticação |
|---|---|---|---|
| Loja (cliente) | `POST` | `/capital-sena/comprar` | Pública (cliente informa CPF/nome no body) |
| Admin (vendedor/distribuidor/admin) | `POST` | `/admin/capital-sena/vendas` | Bearer JWT + `@Roles('ADMIN','DISTRIBUIDOR','VENDEDOR')` |

Ambos os endpoints recebem o **mesmo DTO** (`CreateVendaSenaDto`).

---

## Regra de ouro do Sena

> Em **toda** cartela Sena o usuário (ou o sistema) escolhe **6 números entre 1 e 60**. O **7º número** é **sempre gerado aleatoriamente pelo backend** e nunca repete entre os 6.

Você nunca envia o 7º número — ele aparece só na resposta (campo `setimoNumero` de cada cartela).

---

## DTO — `CreateVendaSenaDto`

```ts
{
  // ── Edição e pagamento ───────────────────────────
  edicaoSenaId: string;        // UUID (obrigatório)
  tipoPagamento: "PIX" | "CARTAO_CREDITO" | "CARTAO_DEBITO" | "DINHEIRO" | "MANUAL";

  // ── Dados do cliente ────────────────────────────
  cpf: string;                  // "12345678900" ou com máscara
  nome: string;
  telefone: string;
  dataNascimento: string;       // "YYYY-MM-DD"
  email?: string;

  // ── Origem da venda (qualquer um, opcional) ─────
  vendedorId?: string;          // UUID
  distribuidorId?: string;      // UUID
  seller_id?: string;           // UUID — recebido pela URL da loja (?seller_id=…)

  // ── Cartelas: ESCOLHA UM dos 3 modos abaixo ─────

  // Modo 1: cartelas explícitas (MANUAL ou SURPRESINHA por item)
  cartelas?: Array<{
    numeros?: number[];          // 6 números (1–60), obrigatório se modoSelecao = MANUAL
    modoSelecao: "MANUAL" | "SURPRESINHA";
  }>;

  // Modo 2: compra rápida unitária
  quantidade?: number;           // 1–1000 — sistema gera N cartelas surpresinha

  // Modo 3: combo (com ou sem cartelas explícitas)
  comboSenaId?: string;          // UUID do combo da edição
}
```

### Resolução do backend

| `cartelas` | `quantidade` | `comboSenaId` | Comportamento |
|---|---|---|---|
| ✅ presente | — | — | Usa as cartelas como vieram. Cada uma valida pelo `modoSelecao`. |
| ✅ presente | — | ✅ | Idem, **mas `cartelas.length` deve ser igual a `combo.quantidade`** (senão `400`). |
| ❌ vazio | ✅ | — | Compra rápida: gera **`quantidade`** cartelas surpresinha. |
| ❌ vazio | — | ✅ | Compra rápida combo: gera **`combo.quantidade`** cartelas surpresinha. |
| ❌ vazio | ✅ | ✅ | Combo vence: gera **`combo.quantidade`** (ignora `quantidade`). |
| ❌ vazio | ❌ | ❌ | `400 Bad Request`: "Informe `cartelas`, `quantidade` ou `comboSenaId`". |

> Em todos os cenários: o **7º número** é gerado pelo backend para cada cartela, garantindo não-repetição com os 6.

---

## Cenários (com exemplos de body)

### Cenário 1 — Compra MANUAL unitária

Cliente digita os 6 números de uma cartela. Combo é ignorado.

```json
{
  "edicaoSenaId": "11111111-1111-1111-1111-111111111111",
  "tipoPagamento": "PIX",
  "cpf": "12345678900",
  "nome": "Maria Silva",
  "telefone": "(11) 99999-9999",
  "email": "maria@email.com",
  "dataNascimento": "1985-04-11",

  "cartelas": [
    { "numeros": [3, 12, 24, 37, 45, 58], "modoSelecao": "MANUAL" }
  ]
}
```

**Validações do backend para cada item MANUAL:**
- `numeros` deve ter **exatamente 6** itens.
- Todos os números entre **1 e 60**.
- **Sem repetição** dentro da cartela.
- Os números são **persistidos em ordem crescente** (mesmo que o cliente envie fora de ordem).

### Cenário 2 — Compra MANUAL múltipla (sem combo)

Cliente digita várias cartelas, cada uma com 6 números próprios.

```json
{
  "edicaoSenaId": "11111111-1111-1111-1111-111111111111",
  "tipoPagamento": "PIX",
  "cpf": "12345678900",
  "nome": "Maria Silva",
  "telefone": "(11) 99999-9999",
  "dataNascimento": "1985-04-11",

  "cartelas": [
    { "numeros": [3, 12, 24, 37, 45, 58], "modoSelecao": "MANUAL" },
    { "numeros": [1, 7, 22, 33, 41, 60], "modoSelecao": "MANUAL" },
    { "numeros": [2, 8, 15, 29, 47, 55], "modoSelecao": "MANUAL" }
  ]
}
```

Total: `valorCartela × 3`. Cartelas podem ser iguais entre si (o backend não bloqueia).

### Cenário 3 — Compra MANUAL com combo (ex.: combo de 5 cartelas)

Cliente escolhe um combo, mas **digita os 6 números de cada uma** das 5 cartelas.

```json
{
  "edicaoSenaId": "11111111-1111-1111-1111-111111111111",
  "tipoPagamento": "PIX",
  "cpf": "12345678900",
  "nome": "Maria Silva",
  "telefone": "(11) 99999-9999",
  "dataNascimento": "1985-04-11",
  "comboSenaId": "22222222-2222-2222-2222-222222222222",

  "cartelas": [
    { "numeros": [3, 12, 24, 37, 45, 58], "modoSelecao": "MANUAL" },
    { "numeros": [1, 7, 22, 33, 41, 60], "modoSelecao": "MANUAL" },
    { "numeros": [2, 8, 15, 29, 47, 55], "modoSelecao": "MANUAL" },
    { "numeros": [5, 11, 19, 27, 39, 50], "modoSelecao": "MANUAL" },
    { "numeros": [6, 14, 21, 32, 44, 59], "modoSelecao": "MANUAL" }
  ]
}
```

**Atenção:** se o combo selecionado for de 5 cartelas, você **deve enviar exatamente 5 itens** no array `cartelas`. Caso contrário:

```http
400 Bad Request
"O combo \"Combo 5\" requer exatamente 5 cartela(s)"
```

Total: vem do **preço do combo**, não da soma unitária.

### Cenário 4 — Compra rápida (SURPRESA) unitária

Cliente só informa quantas cartelas quer; o backend gera tudo (6 números + 7º).

```json
{
  "edicaoSenaId": "11111111-1111-1111-1111-111111111111",
  "tipoPagamento": "PIX",
  "cpf": "12345678900",
  "nome": "Maria Silva",
  "telefone": "(11) 99999-9999",
  "dataNascimento": "1985-04-11",

  "quantidade": 5
}
```

- Gera **5 cartelas surpresinha**.
- Algoritmo tenta **maximizar diferenciação**: cartelas serão diferentes entre si na prática (C(60,6) ≈ 50 milhões de combinações). Duplicidade é permitida no pior caso, mas extremamente rara.
- Total: `valorCartela × 5`.
- `quantidade` aceita 1 a 1000.

### Cenário 5 — Compra rápida (SURPRESA) com combo

Cliente seleciona um combo; o backend gera todas as cartelas do combo automaticamente.

```json
{
  "edicaoSenaId": "11111111-1111-1111-1111-111111111111",
  "tipoPagamento": "PIX",
  "cpf": "12345678900",
  "nome": "Maria Silva",
  "telefone": "(11) 99999-9999",
  "dataNascimento": "1985-04-11",

  "comboSenaId": "22222222-2222-2222-2222-222222222222"
}
```

- Não envia `cartelas` nem `quantidade`.
- Backend pega `combo.quantidade` e gera N cartelas surpresinha.
- Total: vem do **preço do combo**.

### Cenário 6 — Compra MISTA explícita (MANUAL + SURPRESINHA no mesmo carrinho)

Algumas cartelas o cliente escolheu, outras pediu para o sistema gerar.

```json
{
  "edicaoSenaId": "11111111-1111-1111-1111-111111111111",
  "tipoPagamento": "PIX",
  "cpf": "12345678900",
  "nome": "Maria Silva",
  "telefone": "(11) 99999-9999",
  "dataNascimento": "1985-04-11",

  "cartelas": [
    { "numeros": [3, 12, 24, 37, 45, 58], "modoSelecao": "MANUAL" },
    { "modoSelecao": "SURPRESINHA" },
    { "modoSelecao": "SURPRESINHA" }
  ]
}
```

Para itens `SURPRESINHA` o campo `numeros` é ignorado (pode omitir).

---

## Permissões por perfil

Todos os perfis abaixo podem usar **qualquer cenário** (MANUAL, SURPRESA, combo, unitário):

- `CLIENTE` (loja, sem login obrigatório no fluxo de compra)
- `VENDEDOR` (admin) — atende o cliente digitando os números pelo telefone/balcão
- `DISTRIBUIDOR` (admin)
- `ADMIN` (admin)

### Diferença de pagamento

| Perfil que cria a venda | `tipoPagamento` efetivo | Status inicial | Gateway |
|---|---|---|---|
| `ADMIN` | sempre forçado para `MANUAL` | `APROVADO` (transação imediata) | **Não chama** |
| `VENDEDOR` / `DISTRIBUIDOR` / `CLIENTE` | o que o body enviar (`PIX`, etc.) | `PENDENTE` | Chama gateway e devolve PIX/QR/URL |

O frontend não decide se chama gateway ou não — o backend resolve.

---

## Resposta

### Quando vai para gateway (PIX / Cartão)

```json
{
  "statusCode": 201,
  "message": "Venda Sena criada com sucesso",
  "data": {
    "id": "33333333-3333-3333-3333-333333333333",
    "edicaoSenaId": "...",
    "clienteId": "...",
    "vendedorId": "...",
    "distribuidorId": null,
    "comboSenaId": null,
    "quantidade": 5,
    "total": "75.00",
    "status": "PENDENTE",
    "tipoPagamento": "PIX",
    "gatewayId": "...",
    "createdAt": "2026-05-29T18:30:00.000Z",
    "edicaoSena": { "id": "...", "numero": "001", "valorCartela": "15.00" },
    "cliente": { "id": "...", "nome": "Maria Silva", "cpf": "12345678900", "telefone": "..." },
    "vendedor": null,
    "cartelas": [],
    "pagamento": {
      "pixCopiaECola": "00020126...",
      "qrCodeBase64": "iVBORw0KGgo...",
      "urlPagamento": "https://..."
    }
  }
}
```

> Atenção: na resposta **antes da confirmação do pagamento**, `cartelas: []` é normal. As cartelas (com `numerosEscolhidos` e `setimoNumero`) são criadas no **webhook** do gateway, junto com a transição para `APROVADO`. O frontend deve consultar `GET /capital-sena/vendas/:id/status` para acompanhar.

### Quando é ADMIN (MANUAL, sem gateway)

A venda já volta `APROVADO` com as cartelas geradas:

```json
{
  "statusCode": 201,
  "message": "Venda Sena criada e aprovada com sucesso",
  "data": {
    "id": "...",
    "status": "APROVADO",
    "tipoPagamento": "MANUAL",
    "quantidade": 3,
    "total": "45.00",
    "cartelas": [
      {
        "id": "...",
        "numerosEscolhidos": [3, 12, 24, 37, 45, 58],
        "setimoNumero": 19,
        "modoSelecao": "MANUAL",
        "status": "CONFIRMADA",
        "acertos": null,
        "setimoAcertou": null
      }
      // ...
    ]
  }
}
```

---

## Erros mais comuns (400)

| Mensagem | Causa |
|---|---|
| `Informe \`cartelas\`, \`quantidade\` ou \`comboSenaId\` para a compra Sena` | Body sem nenhum dos três campos. |
| `Cartela manual requer exatamente 6 números` | Item `MANUAL` com `numeros.length !== 6` ou `numeros` ausente. |
| `Números da cartela não podem se repetir` | Repetição dentro dos 6 números informados. |
| `Números da cartela devem estar entre 1 e 60` | Algum número fora do range. |
| `Combo Sena não encontrado nesta edição` | `comboSenaId` inválido ou não pertence à edição. |
| `O combo "X" requer exatamente N cartela(s)` | `cartelas.length !== combo.quantidade` quando os dois são enviados. |
| `A edição Sena "X" não está ativa (status: ...)` | Edição em `RASCUNHO`, `ENCERRADA`, `APURANDO` ou `FINALIZADA`. |
| `As compras para esta edição já foram encerradas` | `Date.now() >= dataEncerramento`. |

---

## Cheat sheet — qual cenário usar?

- **Cliente quer "compra rápida unitária"** → envie só `quantidade`.
- **Cliente quer "compra rápida combo"** → envie só `comboSenaId`.
- **Cliente quer escolher números (1 ou mais cartelas)** → envie `cartelas` com itens `MANUAL`.
- **Cliente quer escolher números de um combo** → envie `cartelas` (com `combo.quantidade` itens MANUAL) **e** `comboSenaId`.
- **Mistura** (algumas escolhidas, outras surpresa, fora de combo) → envie `cartelas` com mix de `MANUAL` e `SURPRESINHA`.

---

## Status de consulta

Após criar a venda, consultar o status até virar `APROVADO`:

```http
GET /capital-sena/vendas/:id/status
```

Quando `status === "APROVADO"`, o campo `cartelas` da resposta passa a conter os 6 números escolhidos + `setimoNumero` de cada cartela. É nesse momento que o frontend pode mostrar as cartelas pro cliente.
