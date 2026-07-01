# CDP — Combos: Antes x Depois (Web / Loja Pública)

> Escopo: módulo `loja-publica` (`/loja/*`), produto **Capital de Prêmios**. Não afeta Capital Sena.

## Resumo da mudança

O modelo de configuração de ranges da edição migrou de **`EdicaoDetalhe`** (múltiplos
"setores" por `indiceRange`, com salto fixo entre eles) para **`EdicaoCombo`** com
`rangeInicio`/`rangeFinal` **embutidos no próprio combo**. Cada combo agora é
autossuficiente: tem seu próprio range, preço e tipo de cartela.

**⚠️ Não existe mais "compra unitária" como modo de compra separado.** Toda venda —
inclusive a antiga "cartela única" (1 chance) — agora é resolvida como um **combo**
(`tipoCartela: UMA_CHANCE`). Se a edição não tiver nenhum `EdicaoCombo` configurado
para a origem `DIGITAL`, a compra falha com `BadRequestException`, mesmo que o cliente
só queira "1 número avulso".

---

## Como era

### Configuração da edição (admin)

```
detalhes: {
  "DIGITAL": [
    { "indiceRange": 1, "rangeInicio": "0000001", "rangeFinal": "0001000" },
    { "indiceRange": 2, "rangeInicio": "0001001", "rangeFinal": "0002000" }
  ]
}
combos: [
  { "origemParticipacao": "DIGITAL", "quantidadeCartelas": 3, "preco": "20.00" }
]
```

- O range físico vinha de `EdicaoDetalhe` (um ou mais "setores" sequenciais).
- O `EdicaoCombo` só guardava **preço** por `tipoCartela` — o range era resolvido
  combinando o(s) `EdicaoDetalhe` da origem.
- Uma compra "avulsa" (sem `comboId`) usava o **primeiro `EdicaoDetalhe`** e o
  `edicao.valorCartela` direto — funcionava mesmo sem nenhum combo cadastrado.

### Checkout (`POST /loja/comprar`)

```json
{
  "edicaoId": "uuid-da-edicao",
  "quantidade": 2,
  "quantidadeCartelas": 1,
  "cpf": "12345678900",
  "nome": "João Silva",
  "telefone": "61999999999",
  "valor": 60.0
}
```

`quantidadeCartelas: 1` (ou ausência de `comboId`) era tratado como **compra
unitária**: preço = `edicao.valorCartela`, range = `EdicaoDetalhe[0]`.

---

## Como é agora

### Configuração da edição (admin)

```json
combos: [
  {
    "origemParticipacao": "DIGITAL",
    "tipoCartela": "UMA_CHANCE",
    "quantidadeCartelas": 1,
    "preco": "10.00",
    "rangeInicio": "0951000",
    "rangeFinal": "0952000"
  },
  {
    "origemParticipacao": "DIGITAL",
    "tipoCartela": "TRES_CHANCES",
    "quantidadeCartelas": 3,
    "preco": "20.00",
    "rangeInicio": "0960000",
    "rangeFinal": "0961000"
  }
]
```

`CreateEdicaoComboDto` (`src/modules/edicoes/dto/create-edicao-combo.dto.ts`) ganhou
dois campos **obrigatórios** novos:

| Campo | Antes | Agora |
|---|---|---|
| `rangeInicio` | não existia no combo | `@IsString @MinLength(7) @Matches(/^\d{7,}$/)` — **obrigatório** |
| `rangeFinal` | não existia no combo | `@IsString @MinLength(7) @Matches(/^\d{7,}$/)` — **obrigatório** |
| `quantidadeCartelas` | `@Min(1)` sem teto | `@Min(1) @Max(12)` |

O campo `detalhes` saiu inteiramente do `CreateEdicaoDto`/`UpdateEdicaoDto` — não é
mais aceito no payload de criação/edição de edição.

### Checkout (`POST /loja/comprar`)

O DTO `ComprarLojaDto` em si **não mudou** (mesmos campos: `quantidadeCartelas`,
`comboId`, `cartelasSelecionadas`, etc). O que mudou é o que acontece no backend:

- Se você comprar "1 chance" via `quantidadeCartelas: 1` sem `comboId`, a API agora
  precisa encontrar um `EdicaoCombo` com `tipoCartela: UMA_CHANCE` (ou o primeiro
  combo da origem) para resolver o range. **Sem nenhum combo cadastrado para
  `DIGITAL`, a alocação do bilhete falha.**
- Não existe mais fallback para `edicao.rangeInicio`/`edicao.rangeFinal` puro.

```json
{
  "edicaoId": "uuid-da-edicao",
  "quantidade": 2,
  "quantidadeCartelas": 1,
  "cpf": "12345678900",
  "nome": "João Silva",
  "telefone": "61999999999",
  "valor": 60.0
}
```
Mesmo payload de antes — mas agora "por baixo dos panos" isso é uma venda do combo
`UMA_CHANCE`, não mais uma "cartela avulsa sem dono".
