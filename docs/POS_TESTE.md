# POS — Guia de Teste Passo a Passo

> Canal exclusivo dos terminais físicos. O POS usa token JWT próprio (secret e expiração isolados do painel admin).
>
> **Base URL:** `http://localhost:3000/api/pos`  
> **Swagger:** `http://localhost:3000/api/docs` → seção "POS / ..."

---

## Credenciais de Teste (seed)

| Perfil | CPF | Nome |
|--------|-----|------|
| VENDEDOR | `11122233344` | João Vendedor |
| VENDEDOR | `22233344455` | Maria Vendedora |
| DISTRIBUIDOR | `12345678909` | Distribuidora Norte |

> Substitua pelo CPF real do operador em produção/staging (ex: `31774704560`).

---

## Fluxo Capital de Prêmios

### Passo 1 — Login

```http
POST /api/pos/auth/login
Content-Type: application/json

{
  "cpf": "11122233344"
}
```

**Resposta esperada (200):**
```json
{
  "statusCode": 200,
  "message": "Login realizado com sucesso",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "perfil": "VENDEDOR",
    "operador": {
      "nome": "João Vendedor",
      "cpf": "11122233344",
      "perfil": "VENDEDOR",
      "vendedorId": "<uuid>",
      "distribuidorId": null
    }
  }
}
```

Guarde o `accessToken`. Todas as rotas seguintes exigem o header:
```
Authorization: Bearer <accessToken>
```

---

### Passo 2 — Verificar operador logado (opcional)

```http
GET /api/pos/auth/me
Authorization: Bearer <accessToken>
```

**Resposta esperada (200):**
```json
{
  "statusCode": 200,
  "message": "Operador autenticado",
  "data": {
    "perfil": "VENDEDOR",
    "cpf": "11122233344",
    "vendedorId": "<uuid>",
    "distribuidorId": null
  }
}
```

---

### Passo 3 — Listar edições ativas

```http
GET /api/pos/edicoes
Authorization: Bearer <accessToken>
```

**Resposta esperada (200):**
```json
{
  "statusCode": 200,
  "message": "Edições ativas listadas com sucesso",
  "data": [
    {
      "id": "<edicaoId>",
      "numero": "001",
      "frase": "Participe e ganhe!",
      "imagemUrl": null,
      "valorCartela": "5.00",
      "dataSorteio": "2026-07-01T15:00:00.000Z",
      "dataEncerramento": "2026-06-30T23:59:00.000Z"
    }
  ]
}
```

Copie o `id` da edição desejada — usado em todos os passos seguintes como `{edicaoId}`.

---

### Passo 4 — Listar opções configuradas da edição

Lista as opções de venda disponíveis (unitária e combos) com preço e quantidade de cartelas. Use para montar a tela de escolha do terminal.

Quando a opção for `tipoCompra: "COMBO"`, o campo `id` retornado é o `comboId`
que deve ser enviado depois no `POST /api/pos/vendas`.

```http
GET /api/pos/edicoes/{edicaoId}/opcoes
Authorization: Bearer <accessToken>
```

**Resposta esperada (200):**
```json
{
  "statusCode": 200,
  "message": "Opções de venda POS listadas com sucesso",
  "data": {
    "edicaoId": "<edicaoId>",
    "edicaoNumero": "001",
    "origemParticipacao": "POS",
    "opcoes": [
      {
        "tipoCompra": "UNITARIO",
        "tipoCartela": "UMA_CHANCE",
        "quantidadeCartelas": 1,
        "preco": "5.00",
        "indiceRange": 1
      },
      {
        "tipoCompra": "COMBO",
        "id": "f3d6cb09-4f2e-437c-8d4e-e32cfd0aa111",
        "tipoCartela": "DUAS_CHANCES",
        "quantidadeCartelas": 2,
        "preco": "8.00",
        "indiceRange": null
      },
      {
        "tipoCompra": "COMBO",
        "id": "8d0b4f74-7a4e-4fe3-a731-46f2cc22a111",
        "tipoCartela": "TRES_CHANCES",
        "quantidadeCartelas": 3,
        "preco": "12.00",
        "indiceRange": null
      }
    ]
  }
}
```

---

### Passo 5 — Navegar combos disponíveis

Retorna 1 combo por chamada (navegação por cursor). Usa a configuração DIGITAL da edição.

#### Primeiro combo (sem filtro)
```http
GET /api/pos/edicoes/{edicaoId}/combos
Authorization: Bearer <accessToken>
```

#### Combo de 3 cartelas
```http
GET /api/pos/edicoes/{edicaoId}/combos?quantidadeCartelas=3
Authorization: Bearer <accessToken>
```

#### Próximo combo (navegação por cursor)
```http
GET /api/pos/edicoes/{edicaoId}/combos?quantidadeCartelas=3&cursorNumeroBase=0276145&direcao=PROXIMO
Authorization: Bearer <accessToken>
```

#### Combo anterior
```http
GET /api/pos/edicoes/{edicaoId}/combos?quantidadeCartelas=3&cursorNumeroBase=0276145&direcao=ANTERIOR
Authorization: Bearer <accessToken>
```

**Parâmetros de query:**

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `quantidadeCartelas` | number (1–12) | Não | Quantidade de cartelas do combo. Se omitido, usa o primeiro combo configurado. |
| `cursorNumeroBase` | string (dígitos) | Não | Número base do combo atual para navegar. |
| `direcao` | `PROXIMO` \| `ANTERIOR` | Não | Direção da navegação. Padrão: `PROXIMO`. |

**Resposta esperada (200) — combo encontrado:**
```json
{
  "statusCode": 200,
  "message": "Combos disponíveis listados com sucesso",
  "data": {
    "edicaoId": "<edicaoId>",
    "edicaoNumero": "001",
    "status": "ATIVA",
    "origemParticipacao": "DIGITAL",
    "tipoCompra": "COMBO",
    "quantidadeCartelas": 3,
    "valorUnitarioCartela": "5.00",
    "valorCombo": "12.00",
    "preco": "12.00",
    "passoEntreCartelas": "100000",
    "rangeTotalInicio": "0000001",
    "rangeTotalFinal": "0999999",
    "setores": [
      { "indiceCartela": 1, "rangeInicio": "0000001", "rangeFinal": "0099999" },
      { "indiceCartela": 2, "rangeInicio": "0100001", "rangeFinal": "0199999" },
      { "indiceCartela": 3, "rangeInicio": "0200001", "rangeFinal": "0299999" }
    ],
    "cursorNumeroBaseAtual": "0276145",
    "combos": [
      {
        "ordemSequencia": 1,
        "numeroBase": "0276145",
        "bilhetes": [
          { "ordem": 1, "matrizId": "<uuid>", "numero": "0276145", "sequenciaBolas": [4, 12, 23, 31, 42, 55] },
          { "ordem": 2, "matrizId": "<uuid>", "numero": "0376145", "sequenciaBolas": [7, 14, 21, 36, 48, 59] },
          { "ordem": 3, "matrizId": "<uuid>", "numero": "0476145", "sequenciaBolas": [2, 10, 18, 29, 41, 53] }
        ]
      }
    ],
    "comboAtual": {
      "numeroBase": "0276145",
      "bilhetes": [...]
    }
  }
}
```

> `comboAtual` é o atalho — sempre o primeiro (e único) item de `combos`. Use ele para exibir no terminal.

**Resposta quando não há combo configurado:**
```json
{
  "statusCode": 200,
  "message": "Nenhum combo configurado para esta seleção",
  "data": { "combos": [], "comboAtual": null, ... }
}
```

---

### Passo 6 — Reservar cartelas (pré-compra)

Marca as cartelas como reservadas por **5 minutos** para o operador. Exige Redis configurado.

Para reservar um combo, envie todos os números de `comboAtual.bilhetes`:

```http
POST /api/pos/edicoes/{edicaoId}/reservas
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "cartelas": ["0276145", "0376145", "0476145"]
}
```

**Resposta esperada (201):**
```json
{
  "statusCode": 201,
  "message": "Cartelas reservadas para pré-compra POS",
  "data": {
    "edicaoId": "<edicaoId>",
    "edicaoNumero": "001",
    "reservadas": 3,
    "cartelas": ["0276145", "0376145", "0476145"],
    "expiresIn": 300
  }
}
```

> **Conflito (409):** a cartela já foi vendida ou reservada por outro operador.  
> **Indisponível (503):** Redis não configurado.

---

### Passo 7 — Criar venda

A venda nasce como `PENDENTE`. A API cria a cobrança PIX no gateway e retorna os dados para exibir o QR Code no terminal.

#### Compra por combo (usar após passo 5 e 6)

```http
POST /api/pos/vendas
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "edicaoId": "<edicaoId>",
  "combosSelecionados": ["0276145", "0376145", "0476145"],
  "cpf": "11111111111",
  "nome": "Carlos Cliente",
  "telefone": "(11) 97000-0001",
  "email": "carlos@email.com",
  "dataNascimento": "1990-05-15"
}
```

#### Compra unitária com cartelas específicas

```http
POST /api/pos/vendas
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "edicaoId": "<edicaoId>",
  "quantidadeCartelas": 1,
  "cartelasSelecionadas": ["0276145"],
  "cpf": "11111111111",
  "nome": "Carlos Cliente",
  "telefone": "(11) 97000-0001",
  "dataNascimento": "1990-05-15"
}
```

#### Compra rápida (sistema escolhe as cartelas)

```http
POST /api/pos/vendas
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "edicaoId": "<edicaoId>",
  "quantidadeCartelas": 2,
  "cpf": "11111111111",
  "nome": "Carlos Cliente",
  "telefone": "(11) 97000-0001",
  "dataNascimento": "1990-05-15"
}
```

**Campos do body:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `edicaoId` | UUID | Sim | ID da edição |
| `quantidadeCartelas` | number | Condicional | Obrigatório para compra unitária |
| `cartelasSelecionadas` | string[] | Não | Números de cartelas unitárias reservadas |
| `combosSelecionados` | string[] | Não | Números do combo reservado |
| `tipoPagamento` | `PIX` | Não | Padrão PIX (único suportado) |
| `cpf` | string | Sim | CPF do cliente |
| `nome` | string | Sim | Nome do cliente |
| `telefone` | string | Sim | Telefone do cliente |
| `email` | string | Não | E-mail do cliente |
| `dataNascimento` | YYYY-MM-DD | Sim | Data de nascimento |

> **Nunca envie `vendedorId`, `distribuidorId` ou `origemParticipacao`** — a API resolve pelo token POS.

**Resposta esperada (201):**
```json
{
  "statusCode": 201,
  "message": "Venda criada com sucesso",
  "data": {
    "id": "<vendaId>",
    "status": "PENDENTE",
    "origemParticipacao": "POS",
    "total": "12.00",
    "pagamento": {
      "pixCopiaECola": "00020126580014br.gov.bcb.pix...",
      "qrCodeBase64": "https://assets.pagseguro.com.br/...",
      "urlPagamento": "https://assets.pagseguro.com.br/..."
    }
  }
}
```

Guarde o `id` retornado para o polling de status.

---

### Passo 8 — Polling do status de pagamento

Chame a cada 3–5 segundos até `pago = true` ou `status` ∈ `{APROVADO, RECUSADO, CANCELADO}`.

```http
GET /api/pos/vendas/{vendaId}/pagamento
Authorization: Bearer <accessToken>
```

**Resposta — aguardando:**
```json
{
  "statusCode": 200,
  "message": "Status do pagamento POS consultado",
  "data": {
    "vendaId": "<vendaId>",
    "status": "PENDENTE",
    "statusLabel": "Aguardando pagamento",
    "statusGateway": "PENDENTE",
    "total": "12.00",
    "criadoEm": "2026-06-16T14:30:00.000Z",
    "pago": false
  }
}
```

**Resposta — aprovado:**
```json
{
  "data": {
    "status": "APROVADO",
    "statusLabel": "Pagamento confirmado",
    "pago": true
  }
}
```

---

### Passo 9 — Logout

Descarta o token no cliente (stateless — não há revogação no servidor).

```http
POST /api/pos/auth/logout
Authorization: Bearer <accessToken>
```

---

## Fluxo Capital Sena

### Passo 1 — Listar edições Sena ativas

```http
GET /api/pos/capital-sena/edicoes
Authorization: Bearer <accessToken>
```

**Resposta esperada (200):**
```json
{
  "statusCode": 200,
  "message": "Edições Sena ativas listadas com sucesso",
  "data": [
    {
      "id": "<edicaoSenaId>",
      "numero": "2026-15",
      "valorCartela": "5.00",
      "dataSorteioMegaSena": "2026-06-28T20:00:00.000Z",
      "dataEncerramento": "2026-06-28T18:00:00.000Z",
      "combos": [
        { "id": "<comboSenaId>", "nome": "Combo 3", "quantidade": 3, "preco": "12.00" }
      ]
    }
  ]
}
```

---

### Passo 2 — Criar venda Sena

#### Surpresinha (sistema sorteia os números)

```http
POST /api/pos/capital-sena/vendas
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "edicaoSenaId": "<edicaoSenaId>",
  "cartelas": [
    { "modoSelecao": "SURPRESINHA" },
    { "modoSelecao": "SURPRESINHA" },
    { "modoSelecao": "SURPRESINHA" }
  ],
  "cpf": "11111111111",
  "nome": "Carlos Cliente",
  "telefone": "(11) 97000-0001",
  "dataNascimento": "1990-05-15"
}
```

#### Números manuais

```http
POST /api/pos/capital-sena/vendas
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "edicaoSenaId": "<edicaoSenaId>",
  "cartelas": [
    { "modoSelecao": "MANUAL", "numeros": [3, 12, 24, 37, 45, 58] }
  ],
  "cpf": "11111111111",
  "nome": "Carlos Cliente",
  "telefone": "(11) 97000-0001",
  "dataNascimento": "1990-05-15"
}
```

#### Com combo Sena

```http
POST /api/pos/capital-sena/vendas
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "edicaoSenaId": "<edicaoSenaId>",
  "comboSenaId": "<comboSenaId>",
  "cartelas": [
    { "modoSelecao": "SURPRESINHA" },
    { "modoSelecao": "SURPRESINHA" },
    { "modoSelecao": "SURPRESINHA" }
  ],
  "cpf": "11111111111",
  "nome": "Carlos Cliente",
  "telefone": "(11) 97000-0001",
  "dataNascimento": "1990-05-15"
}
```

**Resposta esperada (201):**
```json
{
  "statusCode": 201,
  "message": "Venda Sena criada com sucesso",
  "data": {
    "id": "<vendaSenaId>",
    "status": "PENDENTE",
    "quantidade": 3,
    "total": "12.00",
    "pagamento": {
      "pixCopiaECola": "00020126580014br.gov.bcb.pix...",
      "qrCodeBase64": "https://...",
      "urlPagamento": "https://..."
    }
  }
}
```

---

### Passo 3 — Polling do status Sena

```http
GET /api/pos/capital-sena/vendas/{vendaSenaId}/pagamento
Authorization: Bearer <accessToken>
```

Mesma lógica do Capital de Prêmios — faça polling até `pago = true`.

---

## Resumo dos Endpoints

| # | Método | Rota | Descrição |
|---|--------|------|-----------|
| 1 | `POST` | `/api/pos/auth/login` | Login por CPF |
| 2 | `GET` | `/api/pos/auth/me` | Dados do operador logado |
| 3 | `POST` | `/api/pos/auth/logout` | Logout (stateless) |
| 4 | `GET` | `/api/pos/edicoes` | Listar edições Prêmios ativas |
| 5 | `GET` | `/api/pos/edicoes/{id}/opcoes` | Opções configuradas (unitário + combos) |
| 6 | `GET` | `/api/pos/edicoes/{id}/combos` | Navegar combos disponíveis |
| 7 | `POST` | `/api/pos/edicoes/{id}/reservas` | Reservar cartelas (TTL 5 min) |
| 8 | `POST` | `/api/pos/vendas` | Criar venda Prêmios + gerar PIX |
| 9 | `GET` | `/api/pos/vendas/{id}/pagamento` | Polling de status do pagamento |
| 10 | `GET` | `/api/pos/capital-sena/edicoes` | Listar edições Sena ativas |
| 11 | `POST` | `/api/pos/capital-sena/vendas` | Criar venda Sena + gerar PIX |
| 12 | `GET` | `/api/pos/capital-sena/vendas/{id}/pagamento` | Polling de status Sena |

---

## Observações importantes

- O token POS tem **secret e expiração isolados** do painel admin (`JWT_POS_SECRET`, `JWT_POS_EXPIRES`). Um token POS não acessa rotas `/admin`.
- A venda nasce sempre como `PENDENTE`. A confirmação ocorre pelo **webhook do PagBank** — não tente aprovar manualmente.
- O POS usa os **ranges e combos configurados como DIGITAL** — não há configuração específica por canal POS.
- As reservas exigem **Redis configurado**. Sem Redis, o endpoint de reserva retorna 503. A criação de venda sem reserva prévia ainda funciona (cartelas avulsas ou compra rápida).
- O cliente é criado via **upsert por CPF** no momento da venda — não é necessário cadastrá-lo antes.
