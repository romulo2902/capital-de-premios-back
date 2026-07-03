# CDP — Combos: Antes x Depois (WhatsApp)

> Escopo: módulo `whatsapp-api` (`/whatsapp/*`), produto **Capital de Prêmios**
> (`/whatsapp/sena/pedidos` é Capital Sena, intocado).

## Resumo da mudança

Não houve mudança de contrato neste canal nesta etapa da refatoração. O DTO de
criação de pedido (`CriarPedidoWhatsappDto`) e o endpoint `POST /whatsapp/pedidos`
continuam exatamente como estavam.

---

## `POST /whatsapp/pedidos` — sem mudanças

**Compra unitária (1 chance):**
```json
{
  "edicaoId": "uuid-da-campanha",
  "quantidade": 2,
  "quantidadeCartelas": 1
}
```

**Combo:**
```json
{
  "edicaoId": "uuid-da-campanha",
  "quantidade": 1,
  "quantidadeCartelas": 3,
  "combosSelecionados": [{ "numeroBase": "0001234" }]
}
```

Nenhuma ação é necessária do lado da integração do bot/CRM com o WhatsApp neste
momento.
