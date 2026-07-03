# Bug report — assinatura (x-signature) de webhook da Orders API não confere

## Resumo

Webhooks de `order.action_required` (tópico **Order**, Orders API / Checkout Transparente) chegam corretamente na nossa URL configurada, mas o HMAC-SHA256 calculado seguindo **exatamente** a fórmula documentada nunca confere com o `v1` enviado no header `x-signature`. Já reproduzimos o problema em **3 aplicações/contas diferentes**, com secrets recém-gerados em cada uma, e o resultado é sempre o mesmo.

## Ambiente

- Modo: **Sandbox / Teste** (`live_mode: false`)
- Integração: Checkout Transparente via **Orders API**
- Application IDs testados: `6967925675844393`, `5472985515337460`
- User IDs testados: `3476217050`, `3479409210`
- URL de notificação configurada: `https://api2.capitaldepremios.com.br/api/pagamentos/webhook/mercadopago`
- Evento assinado: somente **Order (Mercado Pago)**

## O que validamos antes de reportar

1. **Secret 100% correto** — comparamos via fingerprint SHA256 (calculado localmente a partir do valor copiado do painel "Assinatura secreta" e no servidor a partir da env var) e os fingerprints batem exatamente, byte a byte.
2. **Headers chegam limpos** — logamos `x-signature` e `x-request-id` brutos (com `JSON.stringify`, que revelaria qualquer caractere invisível) e não há nada de estranho: formato `ts=<unix>,v1=<hex64>` padrão, `x-request-id` é um UUID v4 limpo.
3. **Fórmula do manifest seguida à risca**, conforme a documentação (`/developers/pt/docs/checkout-api-orders/notifications`):
   ```
   id:[data.id em minúsculas];request-id:[header x-request-id];ts:[header ts];
   ```
4. **HMAC-SHA256, saída hexadecimal**, chave = assinatura secreta (UTF-8), mensagem = manifest acima — exatamente como no exemplo de código da própria documentação.
5. Testamos **mais de 15 variações** da fórmula para descartar mal-entendido nosso: `data.id` em maiúsculas (sem lowercase), ordem dos campos trocada, sem `;` final, secret decodificado como hex/base64 em vez de string UTF-8, chave e mensagem invertidas, SHA1 em vez de SHA256, campos extras (`type`, `external_reference`) incluídos no manifest, `request-id` sem hífens, separador por vírgula em vez de `;`. **Nenhuma variação produz o hash recebido.**

## Exemplo reproduzível

```
Order ID:        ORDTST01KVB8AJYFXTAP25J4HRQDKCN1
x-request-id:     bfe15537-af5c-4e59-8e18-3a797358868e
x-signature (raw): ts=1781715523,v1=df6b1068426af23000b8e4f37e592f550683fe843b5c9bfe98714f2fbd0c982d

Manifest calculado:
id:ordtst01kvb8ajyfxtap25j4hrqdkcn1;request-id:bfe15537-af5c-4e59-8e18-3a797358868e;ts:1781715523;

HMAC-SHA256(manifest, secret) calculado por nós:
981a01f011ea9b753215b5c8dc3f50eeff125f9d015e6935e70a6bba5044c4c7

v1 recebido no header:
df6b1068426af23000b8e4f37e592f550683fe843b5c9bfe98714f2fbd0c982d

Secret usado (fingerprint SHA256, 16 primeiros hex chars, confirmado idêntico
ao valor exibido no painel "Webhooks > Configurar notificações > Modo de teste > Assinatura secreta"):
b9be69ec7f8c8e53
```

Os dois valores (calculado vs recebido) são consistentemente diferentes em **toda** notificação de tópico `order` recebida — em mais de uma dezena de tentativas, com 3 secrets diferentes, em 2 aplicações diferentes.

## Pergunta para o suporte

Qual é o manifest exato (string usada como mensagem no HMAC) que a Mercado Pago utiliza para assinar notificações do tópico **order** especificamente? A fórmula documentada em "Configurar notificações" parece não corresponder ao que está sendo realmente usado para assinar esses eventos no nosso ambiente de sandbox — ou há algo específico do tópico `order` (diferente do tópico clássico `payment`) que não está coberto na documentação pública?

## Código de referência (nossa implementação)

```typescript
const manifest = `id:${orderId.toLowerCase()};request-id:${xRequestId};ts:${ts};`;
const hashEsperado = createHmac('sha256', secret).update(manifest).digest('hex');
```
