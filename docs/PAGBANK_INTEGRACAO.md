# Integração PagBank

Este documento descreve as requisições e respostas das APIs PagBank utilizadas pela integração do projeto `capital-premios-api`.

Objetivo:
- registrar com clareza quais endpoints da PagBank são usados
- documentar exemplos de `request` e `response`
- facilitar envio do material para homologação/aprovação junto à PagBank

## Visão Geral

A integração atual utiliza:

1. `POST /oauth2/token`
2. `POST /orders` para criação de pedido com QR Code PIX
3. `POST /orders` para criação e pagamento com cartão de crédito
4. `GET /orders/{order_id}` para consulta de pedido PIX
5. `GET /charges/{charge_id}` para consulta de cobrança
6. `POST /charges/{charge_id}/cancel` para cancelamento de cobrança
7. Webhooks da API Order
8. Fallback legado por `notificationCode` para compatibilidade

## Ambientes

Homologação:
```txt
https://sandbox.api.pagseguro.com
```

Produção:
```txt
https://api.pagseguro.com
```

## 1. Obtenção de Token OAuth2

Endpoint:
```txt
POST /oauth2/token
```

Headers:
```http
Authorization: Basic {base64(client_id:client_secret)}
Content-Type: application/x-www-form-urlencoded
Accept: application/json
```

Request:
```txt
grant_type=client_credentials
```

Response:
```json
{
  "access_token": "eyJraWQiOiJ...",
  "token_type": "Bearer",
  "expires_in": 7200
}
```

## 2. Criar Pedido com QR Code PIX

Endpoint:
```txt
POST /orders
```

Headers:
```http
Authorization: Bearer {access_token}
Content-Type: application/json
Accept: application/json
```

Request:
```json
{
  "reference_id": "venda-uuid-123",
  "customer": {
    "name": "Jose da Silva",
    "email": "jose@email.com",
    "tax_id": "12345678909",
    "phones": [
      {
        "country": "55",
        "area": "11",
        "number": "999999999",
        "type": "MOBILE"
      }
    ]
  },
  "items": [
    {
      "reference_id": "venda-uuid-123",
      "name": "Capital de Prêmios - Edição 012 - 5 cartelas",
      "quantity": 1,
      "unit_amount": 5000
    }
  ],
  "qr_codes": [
    {
      "amount": {
        "value": 5000
      },
      "expiration_date": "2026-05-25T18:30:00.000Z"
    }
  ],
  "notification_urls": [
    "https://api.seudominio.com/api/pagamentos/webhook/pix"
  ]
}
```

Response:
```json
{
  "id": "ORDE_F87334AC-BB8B-42E2-AA85-8579F70AA328",
  "reference_id": "venda-uuid-123",
  "customer": {
    "name": "Jose da Silva",
    "email": "jose@email.com",
    "tax_id": "12345678909"
  },
  "items": [
    {
      "reference_id": "venda-uuid-123",
      "name": "Capital de Prêmios - Edição 012 - 5 cartelas",
      "quantity": 1,
      "unit_amount": 5000
    }
  ],
  "qr_codes": [
    {
      "id": "QRCO_86FE511B-E945-4FE1-BB5D-297974C0DB74",
      "amount": {
        "value": 5000
      },
      "text": "00020101021226...",
      "links": [
        {
          "rel": "QRCODE.PNG",
          "href": "https://sandbox.api.pagseguro.com/qrcode/QRCO_.../png",
          "media": "image/png",
          "type": "GET"
        },
        {
          "rel": "QRCODE.BASE64",
          "href": "https://sandbox.api.pagseguro.com/qrcode/QRCO_.../base64",
          "media": "text/plain",
          "type": "GET"
        }
      ]
    }
  ],
  "links": [
    {
      "rel": "SELF",
      "href": "https://sandbox.api.pagseguro.com/orders/ORDE_F87334AC-BB8B-42E2-AA85-8579F70AA328",
      "media": "application/json",
      "type": "GET"
    }
  ]
}
```

## 3. Criar e Pagar Pedido com Cartão de Crédito

Endpoint:
```txt
POST /orders
```

Headers:
```http
Authorization: Bearer {access_token}
Content-Type: application/json
Accept: application/json
```

Observação:
- o `cardToken` é gerado no frontend usando SDK/tokenização PagBank
- a integração envia esse token no campo `payment_method.card.encrypted`

Request:
```json
{
  "reference_id": "venda-uuid-456",
  "customer": {
    "name": "Maria Oliveira",
    "tax_id": "98765432100"
  },
  "items": [
    {
      "name": "Capital de Prêmios - Edição 012 - 3 cartelas",
      "quantity": 1,
      "unit_amount": 3000
    }
  ],
  "charges": [
    {
      "reference_id": "venda-uuid-456",
      "description": "Capital de Prêmios - Edição 012 - 3 cartelas",
      "amount": {
        "value": 3000,
        "currency": "BRL"
      },
      "payment_method": {
        "type": "CREDIT_CARD",
        "installments": 1,
        "capture": true,
        "card": {
          "encrypted": "CARD_TOKEN_GERADO_NO_FRONT",
          "store": false
        }
      }
    }
  ],
  "notification_urls": []
}
```

Response:
```json
{
  "id": "ORDE_12345678-ABCD-4321-ABCD-1234567890AB",
  "reference_id": "venda-uuid-456",
  "charges": [
    {
      "id": "CHAR_F1F10115-09F4-4560-85F5-A828D9F96300",
      "reference_id": "venda-uuid-456",
      "status": "PAID",
      "amount": {
        "value": 3000,
        "currency": "BRL"
      },
      "payment_response": {
        "code": "20000",
        "message": "SUCESSO",
        "reference": "123456"
      }
    }
  ],
  "links": [
    {
      "rel": "SELF",
      "href": "https://sandbox.api.pagseguro.com/orders/ORDE_12345678-ABCD-4321-ABCD-1234567890AB"
    }
  ]
}
```

Observação:
- se o emissor exigir autenticação adicional, a resposta pode incluir link `3DS`
- a integração atual também suporta esse retorno

## 4. Consultar Pedido PIX

Endpoint:
```txt
GET /orders/{order_id}
```

Headers:
```http
Authorization: Bearer {access_token}
Accept: application/json
```

Request:
```http
GET /orders/ORDE_F87334AC-BB8B-42E2-AA85-8579F70AA328
```

Response:
```json
{
  "id": "ORDE_F87334AC-BB8B-42E2-AA85-8579F70AA328",
  "reference_id": "venda-uuid-123",
  "charges": [
    {
      "id": "CHAR_F1F10115-09F4-4560-85F5-A828D9F96300",
      "status": "PAID",
      "paid_at": "2026-05-25T15:30:24.352-03:00",
      "amount": {
        "value": 5000,
        "currency": "BRL"
      }
    }
  ],
  "qr_codes": [
    {
      "id": "QRCO_86FE511B-E945-4FE1-BB5D-297974C0DB74",
      "text": "00020101021226..."
    }
  ]
}
```

## 5. Consultar Cobrança

Endpoint:
```txt
GET /charges/{charge_id}
```

Headers:
```http
Authorization: Bearer {access_token}
Accept: application/json
```

Request:
```http
GET /charges/CHAR_F1F10115-09F4-4560-85F5-A828D9F96300
```

Response:
```json
{
  "id": "CHAR_F1F10115-09F4-4560-85F5-A828D9F96300",
  "reference_id": "venda-uuid-456",
  "status": "PAID",
  "paid_at": "2026-05-25T15:30:24.352-03:00",
  "amount": {
    "value": 3000,
    "currency": "BRL"
  },
  "payment_response": {
    "code": "20000",
    "message": "SUCESSO",
    "reference": "123456"
  }
}
```

## 6. Cancelar Cobrança

Endpoint:
```txt
POST /charges/{charge_id}/cancel
```

Headers:
```http
Authorization: Bearer {access_token}
Content-Type: application/json
Accept: application/json
```

Request:
```json
{
  "amount": {
    "value": 0
  }
}
```

Observação:
- o body com `amount.value = 0` é utilizado para cancelamento do valor total

Response:
```json
{
  "id": "CHAR_F1F10115-09F4-4560-85F5-A828D9F96300",
  "status": "CANCELED",
  "amount": {
    "value": 3000,
    "currency": "BRL"
  }
}
```

## 7. Webhooks Recebidos da PagBank

URLs configuradas na integração:

PIX:
```txt
POST https://api.seudominio.com/api/pagamentos/webhook/pix
```

Cartão:
```txt
POST https://api.seudominio.com/api/pagamentos/webhook/cartao
```

### Exemplo de Payload Recebido para PIX

```json
{
  "id": "ORDE_F87334AC-BB8B-42E2-AA85-8579F70AA328",
  "reference_id": "venda-uuid-123",
  "charges": [
    {
      "id": "CHAR_F1F10115-09F4-4560-85F5-A828D9F96300",
      "reference_id": "venda-uuid-123",
      "status": "PAID",
      "paid_at": "2026-05-25T15:30:24.352-03:00"
    }
  ],
  "qr_codes": [
    {
      "id": "QRCO_86FE511B-E945-4FE1-BB5D-297974C0DB74",
      "text": "00020101021226..."
    }
  ]
}
```

### Exemplo de Payload Recebido para Cartão

```json
{
  "event": "CHARGE.PAID",
  "charges": [
    {
      "id": "CHAR_F1F10115-09F4-4560-85F5-A828D9F96300",
      "reference_id": "venda-uuid-456",
      "status": "PAID",
      "paid_at": "2026-05-25T15:30:24.352-03:00"
    }
  ]
}
```

### Response da Nossa API para o Webhook

```json
{
  "message": "Webhook processado",
  "data": [
    {
      "gatewayId": "CHAR_F1F10115-09F4-4560-85F5-A828D9F96300",
      "status": "CONFIRMADA"
    }
  ]
}
```

## 8. Compatibilidade Legada com `notificationCode`

Além dos webhooks da API Order, o backend mantém compatibilidade com notificações legadas baseadas em `notificationCode`.

Endpoint consultado:
```txt
GET https://ws.pagseguro.uol.com.br/v3/transactions/notifications/{notificationCode}?email={email}&token={token}
```

Exemplo de notificação recebida:
```txt
notificationCode=093C100E7FA87FA8C0B664B79F8359773B96
notificationType=transaction
```

Observação:
- esse fluxo é usado apenas como compatibilidade
- a integração principal está baseada na API Order e em webhooks com payload JSON

## Resumo Técnico da Integração

Fluxos efetivamente utilizados:

1. autenticação OAuth2
2. criação de cobrança PIX via `POST /orders`
3. criação e pagamento com cartão via `POST /orders`
4. consulta de pedido PIX via `GET /orders/{id}`
5. consulta de cobrança via `GET /charges/{id}`
6. cancelamento via `POST /charges/{id}/cancel`
7. recebimento de webhooks transacionais
8. fallback legado por `notificationCode`

## Referências Oficiais

- Pedidos e pagamentos (Order): https://developer.pagbank.com.br/docs/pedidos-e-pagamentos-order
- Webhooks: https://developer.pagbank.com.br/reference/webhooks
- Consultar pedido: https://developer.pagbank.com.br/reference/consultar-pedido
- Notificações legadas: https://developer.pagbank.com.br/v1.0/reference/aplicacoes-notificacoes

## Observação Final

Os exemplos deste documento representam o contrato efetivamente usado pela integração atual do projeto. Alguns campos da resposta podem variar conforme ambiente, adquirente, antifraude, exigência de 3DS e configuração da conta PagBank.
