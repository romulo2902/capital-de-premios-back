# CDP — Combos: Antes x Depois (POS)

> Escopo: módulo `pos` (`/pos/*`), produto **Capital de Prêmios**. Não afeta Capital Sena
> (`/pos/capital-sena/vendas` é outro fluxo, intocado).

## Resumo da mudança

Assim como na Web, o range deixou de vir de `EdicaoDetalhe` (setores soltos) e passou
a viver dentro do próprio `EdicaoCombo` (`rangeInicio`/`rangeFinal`).

**⚠️ Não existe mais "compra unitária" como opção distinta.** O endpoint que lista as
opções de compra do POS **parou de retornar a categoria `tipoCompra: "UNITARIO"`**.
Toda opção retornada agora é `tipoCompra: "COMBO"` — inclusive a de 1 chance.

---

## Como era

### `GET /pos/edicoes/{edicaoId}/opcoes`

Resposta combinava duas listas (`src/modules/pos/pos.service.ts`, método
`listarOpcoesVenda`):

```json
{
  "opcoes": [
    {
      "tipoCompra": "UNITARIO",
      "tipoCartela": "UMA_CHANCE",
      "quantidadeCartelas": 1,
      "preco": "10.00",
      "indiceRange": 1
    },
    {
      "id": "uuid-do-combo",
      "tipoCompra": "COMBO",
      "tipoCartela": "TRES_CHANCES",
      "quantidadeCartelas": 3,
      "preco": "20.00",
      "indiceRange": null
    }
  ]
}
```

- `opcoesUnitarias` vinha de `EdicaoDetalhe` filtrado por `tipoCartela: UMA_CHANCE`,
  com `indiceRange` no payload.
- `opcoesCombos` vinha de `EdicaoCombo`, sempre com `indiceRange: null`.
- Esse comportamento ambíguo (duas formas de representar "1 chance" — uma como
  `UNITARIO`, outra eventualmente como `COMBO`) é justamente o que já tinha sido
  reportado como bug pelo time de integração do POS (ver `docs/POS_COMBOS_E_CLIENTE.md`,
  seção 2: *"ao enviar compra de combo, a API retornou valor de compra unitária"*).

### `POST /pos/vendas`

Já não aceitava `tipoCartela` no body (ver doc citada acima) — mas o servidor podia
cair na resolução "unitária" via `EdicaoDetalhe` se `comboId` não fosse enviado.

---

## Como é agora

### `GET /pos/edicoes/{edicaoId}/opcoes`

```json
{
  "opcoes": [
    {
      "id": "uuid-do-combo-uma-chance",
      "tipoCompra": "COMBO",
      "tipoCartela": "UMA_CHANCE",
      "quantidadeCartelas": 1,
      "preco": "10.00"
    },
    {
      "id": "uuid-do-combo-tres-chances",
      "tipoCompra": "COMBO",
      "tipoCartela": "TRES_CHANCES",
      "quantidadeCartelas": 3,
      "preco": "20.00"
    }
  ]
}
```

Diffs concretos em `src/modules/pos/pos.service.ts`:

| | Antes | Agora |
|---|---|---|
| Fonte da opção "1 chance" | `EdicaoDetalhe` (`tipoCompra: 'UNITARIO'`) | `EdicaoCombo` (`tipoCompra: 'COMBO'`) |
| Campo `indiceRange` | presente (`number \| null`) | **removido** do payload |
| Lista | `[...opcoesUnitarias, ...opcoesCombos]` | só `opcoesCombos` |

Toda opção que aparece na lista — incluindo "1 chance" — agora **exige um
`EdicaoCombo` cadastrado** para a origem (`DIGITAL`, reaproveitada pelo POS). Se a
edição não tiver nenhum combo configurado, a lista de opções vem vazia e
`POST /pos/vendas` falha com `BadRequestException: A edição não possui combos
configurados para a origem POS`.

### `POST /pos/vendas`

DTO (`CreatePosVendaDto`, que reaproveita `CreateVendaDto` via `OmitType`) **não
mudou nos campos** — continua sem aceitar `tipoCartela`, `vendedorId`,
`distribuidorId` nem `origemParticipacao` (resolvidos pelo token POS). A mudança é
de comportamento: o fluxo "compra unitária" (`quantidadeCartelas` sem `comboId`)
agora sempre resolve para o combo `UMA_CHANCE` da edição — não há mais um caminho
que ignore completamente os combos.

```json
{
  "edicaoId": "uuid-da-edicao",
  "quantidadeCartelas": 1,
  "cartelasSelecionadas": ["0951004"],
  "cpf": "12345678900",
  "nome": "João Silva",
  "telefone": "61999999999",
  "tipoPagamento": "MANUAL"
}
```

Esse payload continua funcionando exatamente como antes na superfície — mas agora
depende de existir um `EdicaoCombo` com `tipoCartela: UMA_CHANCE` configurado.

---

## Recomendação para o integrador do POS

Pare de usar/checar `tipoCompra === 'UNITARIO'` no front do POS — essa categoria não
existe mais na resposta de `GET /pos/edicoes/{edicaoId}/opcoes`. Trate toda opção
como combo (mesmo "1 chance"), e sempre exija que o admin cadastre um combo
`UMA_CHANCE` para a edição se quiser manter a venda avulsa disponível no terminal.
