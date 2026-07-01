# CDP — Combos: Antes x Depois (Admin — Criação/Edição de Edições)

> Escopo: `POST /admin/edicoes` e `PATCH /admin/edicoes/:id`
> (`src/modules/edicoes/edicoes.controller.ts:32-94`). Não afeta Capital Sena.

## Resumo da mudança

O campo `detalhes` (que configurava os "setores" de range via `EdicaoDetalhe`)
**saiu do payload** de criação/edição de edição. Agora cada item de `combos`
carrega seu **próprio range** (`rangeInicio`/`rangeFinal`), além de preço e tipo de
cartela. O admin não configura mais ranges separadamente dos combos — eles são a
mesma coisa.

---

## Como era

### Payload (`POST /admin/edicoes`, multipart/form-data)

```text
numero: "Edição 001"
dataSorteio: "2026-05-20T20:00"
raspadinha: "false"
destino: "AMBOS"   // opcional — se omitido, a API inferia a partir de `detalhes`

detalhes: '{
  "DIGITAL": [
    { "indiceRange": 1, "rangeInicio": "0000001", "rangeFinal": "0001000" },
    { "indiceRange": 2, "rangeInicio": "0001001", "rangeFinal": "0002000" }
  ],
  "FISICO": [
    { "indiceRange": 1, "rangeInicio": "0000001", "rangeFinal": "0000500" }
  ]
}'

combos: '[
  { "origemParticipacao": "DIGITAL", "quantidadeCartelas": 2, "preco": "20.00" }
]'

premios: '[{ "descricao": "Carro 0km", "valor": "50000.00" }]'
imagem: [File]
```

### Regras de validação (antes)

- `detalhes` era **obrigatório**, array com no mínimo 1 item
  (`CreateEdicaoDto.detalhes`, `@ArrayMinSize(1)`).
- `combos` só guardava **preço**; o range de cada combo vinha de combinar os
  `EdicaoDetalhe` da mesma origem.
- Cada combo precisava de uma origem (`DIGITAL` ou `POS`) com `EdicaoDetalhe`
  cadastrados, e a quantidade de cartelas do combo não podia exceder a
  quantidade de ranges (`indiceRange`) configurados para aquela origem
  (`validarCombosComDetalhes`, removido).
- `destino` (SITE/FISICO/AMBOS), se omitido, era **inferido automaticamente** a
  partir de quais origens tinham `detalhes` (`inferirDestinoPorDetalhes`,
  removido).
- `rangeInicio`/`rangeFinal` da **edição** (campos agregados, usados em
  relatórios e na navegação de ranges) vinham de somar/combinar todos os
  `EdicaoDetalhe` (`calcularResumoDosRanges`, removido).
- `qtdNumerosCartela` (quantos números cada bilhete tem) era resolvido buscando
  a `MatrizRange` em **qualquer um** dos setores de `detalhes` (`OR` entre todos
  eles).
- Havia uma validação de capacidade: total de cartelas exigidas pelos `detalhes`
  não podia exceder o total de combinações possíveis para a `qtdNumerosCartela`
  (`validarCapacidadeCartelas`).

---

## Como é agora

### Payload (`POST /admin/edicoes`, multipart/form-data)

```text
numero: "Edição 001"
dataSorteio: "2026-05-20T20:00"
raspadinha: "false"
destino: "AMBOS"   // opcional — se omitido, a API agora usa SITE como padrão fixo

combos: '[
  {
    "origemParticipacao": "DIGITAL",
    "tipoCartela": "UMA_CHANCE",
    "preco": "10.00",
    "rangeInicio": "0951000",
    "rangeFinal": "0952000"
  },
  {
    "origemParticipacao": "DIGITAL",
    "quantidadeCartelas": 3,
    "preco": "20.00",
    "rangeInicio": "0960000",
    "rangeFinal": "0961000"
  }
]'

premios: '[{ "descricao": "Carro 0km", "valor": "50000.00" }]'
imagem: [File]
```

O campo `detalhes` **não existe mais** em `CreateEdicaoDto`/`UpdateEdicaoDto`. Se
enviado, é ignorado pelo `class-validator` (não está mais decorado/whitelisted).

### `CreateEdicaoComboDto` — campos novos/alterados

| Campo | Antes | Agora |
|---|---|---|
| `rangeInicio` | não existia | **novo, obrigatório** — `@MinLength(7) @Matches(/^\d{7,}$/)` |
| `rangeFinal` | não existia | **novo, obrigatório** — `@MinLength(7) @Matches(/^\d{7,}$/)` |
| `quantidadeCartelas` | `@Min(1)`, sem teto | `@Min(1) @Max(12)` |
| `origemParticipacao` | `@IsIn([DIGITAL])` (igual) | `@IsIn([DIGITAL])` (sem mudança) |

### Regras de validação (agora)

Em `edicoes.service.ts`, `validarDetalhesInternos`/`validarCombosComDetalhes` foram
substituídos por `validarCombos`:

- `combos` continua **obrigatório**, no mínimo 1 item.
- **Não duplicar** combo por `origem + quantidadeCartelas` (igual antes).
- **Novo**: `rangeFinal` deve ser `>= rangeInicio` em cada combo.
- **Novo**: os ranges dos combos da edição **não podem se sobrepor entre si**
  (antes a sobreposição só era checada dentro dos próprios `EdicaoDetalhe`,
  função `possuiSobreposicao`, hoje órfã/sem uso). Combos com ranges
  conflitantes agora derrubam a criação/edição com `ConflictException`.
- `destino`, se omitido, **não é mais inferido** — vira sempre
  `DestinoEdicao.SITE` (`dto.destino ?? DestinoEdicao.SITE`).
- `rangeInicio`/`rangeFinal` da edição (agregados) agora são o **mínimo e o
  máximo** entre os ranges de todos os combos (`calcularRangesDosCombosDaEdicao`)
  — não soma mais ranges de múltiplos setores.
- `qtdNumerosCartela` agora é resolvido checando a `MatrizRange` **em cada
  combo individualmente** — a matriz precisa estar carregada para o intervalo
  de todos os combos enviados, não só de um deles.
- A validação de capacidade continua existindo: total de cartelas exigidas
  pelos `combos` não pode exceder o total de combinações possíveis para a
  `qtdNumerosCartela` resolvida.

### `PATCH /admin/edicoes/:id`

Mesma mudança: `detalhes` saiu do `UpdateEdicaoDto`. Enviar `combos` no PATCH
**substitui integralmente** os combos existentes (igual antes — `deleteMany` +
`create`), só que agora cada combo enviado precisa trazer seu próprio range.

---

## Resumo prático para quem integra

- Pare de enviar `detalhes` — o campo não existe mais no payload.
- Todo combo precisa vir com `rangeInicio` e `rangeFinal` próprios (7+ dígitos).
- Se quiser uma edição vendendo em mais de um destino (`AMBOS`), envie
  `destino` explicitamente — não é mais inferido automaticamente.
