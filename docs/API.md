# Capital de Prêmios API — API Reference

Base URL: `http://localhost:3000`
Docs interativos: `GET /api/docs`

---

## Auth

### POST /auth/loja — Login pelo CPF (loja)
```json
// Request
{ "cpf": "123.456.789-00" }

// Response 200
{
  "statusCode": 200,
  "message": "Login realizado com sucesso",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "cliente": { "id": "cuid", "nome": "João Silva", "cpf": "12345678900" }
  }
}
```

### POST /auth/login — Login por email/senha (painel)
```json
// Request
{ "email": "admin@capitalpremios.com", "senha": "Admin@123" }

// Response 200
{
  "statusCode": 200,
  "message": "Login realizado com sucesso",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "usuario": { "id": "cuid", "email": "admin@capitalpremios.com", "perfil": "ADMIN" }
  }
}
```

### POST /auth/refresh — Renovar access token
```json
// Request
{ "refreshToken": "eyJhbGciOiJIUzI1NiIs..." }

// Response 200
{
  "statusCode": 200,
  "message": "Token renovado",
  "data": { "accessToken": "eyJhbGciOiJIUzI1NiIs..." }
}
```

---

## Edições

### GET /edicoes — Listar edições
```json
// Response 200
{
  "statusCode": 200,
  "message": "Edições listadas com sucesso",
  "data": [
    {
      "id": "cuid",
      "numero": 1,
      "dataSorteio": "2025-03-01T20:00:00.000Z",
      "valorCartela": "10.00",
      "status": "ATIVA",
      "qtdPremios": 3
    }
  ]
}
```

### POST /edicoes — Criar edição (ADMIN)
```json
// Request
{
  "numero": 2,
  "dataSorteio": "2025-04-01T20:00:00.000Z",
  "dataEncerramento": "2025-03-31T23:59:59.000Z",
  "valorCartela": 10.00,
  "rangeInicio": 1,
  "rangeFinal": 100000,
  "qtdPremios": 3,
  "especie": "Dinheiro",
  "premios": [
    { "ordem": 1, "descricao": "1º Prêmio", "valor": 5000 },
    { "ordem": 2, "descricao": "2º Prêmio", "valor": 2000 },
    { "ordem": 3, "descricao": "3º Prêmio", "valor": 1000 }
  ]
}
```

---

## Vendas

### POST /vendas — Criar venda
```json
// Request (Bearer token do cliente)
{
  "edicaoId": "cuid_edicao",
  "quantidade": 5,
  "tipoPagamento": "PIX"
}

// Response 201
{
  "statusCode": 201,
  "message": "Venda criada com sucesso",
  "data": {
    "id": "cuid_venda",
    "status": "PENDENTE",
    "total": "50.00",
    "gateway": {
      "pixCopiaECola": "00020126...",
      "qrCodeBase64": "iVBORw0KGgo..."
    }
  }
}
```

### GET /vendas/minhas — Minhas compras (cliente logado)
```json
// Response 200
{
  "statusCode": 200,
  "message": "Vendas listadas",
  "data": [
    {
      "id": "cuid",
      "status": "APROVADO",
      "total": "50.00",
      "createdAt": "2025-02-01T10:00:00.000Z",
      "bilhetes": [
        { "id": "cuid_bilhete", "numero": 12345, "ganhador": false }
      ]
    }
  ]
}
```

---

## Saques

### POST /saques — Solicitar saque (VENDEDOR/DISTRIBUIDOR)
```json
// Request
{ "valor": 500.00 }

// Response 201
{
  "statusCode": 201,
  "message": "Saque solicitado com sucesso",
  "data": { "id": "cuid", "valor": "500.00", "status": "SOLICITADO" }
}
```

---

## WebSocket (Sorteio)

### Conexão
```javascript
const socket = io('http://localhost:3000', {
  auth: { token: 'Bearer eyJhbGciOiJIUzI1NiIs...' }
});

// Entrar na room da edição
socket.emit('join', { edicaoId: 'cuid_edicao' });
```

### Eventos emitidos pelo servidor
```javascript
socket.on('sorteio:numero_marcado', ({ edicaoId, numero, sequenciaBolas }) => { ... });
socket.on('sorteio:ganhador', ({ bilheteId, clienteId, premioDescricao }) => { ... });
socket.on('sorteio:status', ({ edicaoId, status }) => { ... });
socket.on('sorteio:resultado_final', ({ edicaoId, ganhadores }) => { ... });
```

### Eventos enviados pelo admin
```javascript
socket.emit('sorteio:marcar_numero', { edicaoId: 'cuid', numero: 42, sequenciaBolas: [4, 2] });
```

---

## Relatórios

### GET /relatorios/vendas/xlsx — Exportar vendas em XLSX (ADMIN)
Retorna arquivo `.xlsx` com todas as vendas filtradas por período.

Query params: `?dataInicio=2025-01-01&dataFim=2025-01-31&edicaoId=cuid`

### GET /relatorios/comissoes/pdf — Exportar comissões em PDF (ADMIN)
Retorna arquivo `.pdf` com relatório de comissões por vendedor.

---

## QR Code

### GET /qrcode/vendedor/:id — QR Code do vendedor
Retorna imagem PNG do QR Code com link de afiliado do vendedor.

### GET /qrcode/distribuidor/:id — QR Code do distribuidor
Retorna imagem PNG do QR Code com link de afiliado do distribuidor.

---

## Health Check

### GET /health
```json
{ "status": "ok", "timestamp": "2025-02-20T23:00:00.000Z" }
```
