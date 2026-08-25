# Capital Sena — como funciona

Documento de referência da lógica completa do produto Capital Sena: modelo de
dados, ciclo de vida da edição, fluxo de compra, apuração, comissões, acesso
do cliente e operações administrativas. Escrito a partir do código em
`src/modules/capital-sena/` e `prisma/schema.prisma`.

> `docs/SENA_COMPRA_FRONTEND.md` descreve um desenho anterior (backend gerava
> o 7º número, `cartelas`/`quantidade` sem números explícitos). Isso foi
> substituído no commit `abc4364` — o comportamento atual é o descrito aqui.

---

## Visão geral

O Capital Sena espelha a Mega-Sena real: o cliente escolhe 6 números (1 a 60)
mais uma "bola extra" (também 1 a 60, diferente dos 6 principais). Prêmios são
apurados comparando a cartela com o resultado real da Mega-Sena, informado à
mão por um admin (não há integração com API externa da Caixa).

Faixas de prêmio: `QUADRA` (4 acertos), `QUINA` (5), `SENA` (6), `SENA_BONUS`
(6 + bola extra bateu).

---

## Modelo de dados

### `EdicaoSena`
Uma edição/concurso. Campos principais: `numero` (único), `descricao`,
`dataSorteioMegaSena`, `dataEncerramento`, `valorCartela` (preço unitário da
cartela avulsa), `imagemUrl`, `status`.

```
enum StatusEdicaoSena { RASCUNHO, ATIVA, ENCERRADA, APURANDO, FINALIZADA }
```

Relações: `premios` (uma linha por faixa), `combos`, `vendas`, `resultado`
(1:1), `cartelas`.

### `ComboSena`
Pacote/combo de cartelas por edição: `nome`, `quantidade` (nº de cartelas no
combo), `preco` (valor total do combo, tipicamente com desconto vs. avulso),
`ativo`. Só combos com `ativo: true` são ofertáveis na compra.

### `PremioSena`
Um registro por faixa por edição (`@@unique([edicaoSenaId, faixa])`):
`faixa`, `descricao`, `valor`, `imagemUrl`.

### `VendaSena`
Uma compra: `edicaoSenaId`, `clienteId`, `vendedorId?`, `distribuidorId?`,
`comboSenaId?`, `quantidade` (nº de cartelas), `total`, `status`,
`tipoPagamento`, `origemParticipacao`, `gatewayId?`, `gatewayPayload?`.

```
enum StatusVendaSena { PENDENTE, APROVADO, RECUSADO, CANCELADO }
```

Reaproveita os enums compartilhados `TipoPagamento { PIX, CARTAO, MANUAL }` e
`OrigemParticipacao { DIGITAL, FISICO, POS }` — não existem enums exclusivos
do Sena para isso.

### `CartelaSena`
Uma cartela dentro de uma venda: `numerosEscolhidos` (os 6 números),
`setimoNumero?` (a bola extra), `modoSelecao`, `acertos?` e `setimoAcertou?`
(preenchidos na apuração), `status`.

```
enum ModoSelecaoSena { MANUAL, SURPRESINHA }
enum StatusCartelaSena {
  PENDENTE_PAGAMENTO, CONFIRMADA,
  NAO_PREMIADA, QUADRA, QUINA, SENA, SENA_BONUS
}
```

**`modoSelecao` é só um rótulo.** O backend não sorteia números para
`SURPRESINHA` — não existe nenhum gerador aleatório no módulo. O frontend
sempre manda os 6 números + bola extra prontos, independente do modo; a
diferença entre MANUAL e SURPRESINHA é só de UX no cliente (tela de escolha
manual vs. botão "surpresinha" que sorteia no próprio app e envia igual).

### `ResultadoSena`
1:1 com `EdicaoSena`: `numerosSorteados` (os 6 números reais da Mega-Sena),
`setimaBola?` (7º número informado manualmente pelo admin, usado pro
SENA_BONUS), `imagemResultadoUrl?`, `apurado` (bool), `apuradoEm?`.

### `ComissaoSena` / `ComissaoDistribuidorSena`
1:1 com `VendaSena`: `valor`, `status` (`StatusComissao`, compartilhado com
Capital Prêmios: `PENDENTE`/`PAGO`).

**Importante: não existe saldo separado para Sena.** `Vendedor.saldo` e
`Distribuidor.saldo` são uma carteira única, somando comissões de Capital
Prêmios e Capital Sena. `Vendedor`/`Distribuidor` ganharam `linkSena`/
`qrcodeSena` (link e QR code próprios do Sena, paralelos a `link`/`qrcode` do
Capital Prêmios), mas o saldo é o mesmo campo.

---

## Ciclo de vida da edição

```
RASCUNHO → ATIVA → ENCERRADA → APURANDO → FINALIZADA
```

Módulo: `src/modules/capital-sena/edicoes-sena/`.

- **Criar** (`create`): valida `dataEncerramento < dataSorteioMegaSena`,
  valida que os prêmios informados são só das 4 faixas válidas e sem
  duplicidade, valida `numero` único, sobe imagens (edição + cada prêmio) pro
  S3, cria `EdicaoSena` + `premios` + `combos` numa transação. Nasce em
  `RASCUNHO` (default do schema).
- **Ativar**: idempotente se já `ATIVA`; recusa se `FINALIZADA`/`APURANDO`;
  **só pode haver uma edição `ATIVA` no sistema por vez** — tentar ativar uma
  segunda dá `ConflictException` pedindo pra encerrar a atual primeiro.
- **Encerrar**: só `ATIVA → ENCERRADA`.
- **Editar**: bloqueado se `FINALIZADA` ou `APURANDO`. Substituir `premios`/
  `combos` apaga tudo e recria.
- **Remover**: só em `RASCUNHO`.
- `ENCERRADA → APURANDO` acontece **automaticamente** quando o admin insere o
  resultado real da Mega-Sena (módulo `sorteio-sena`, não `edicoes-sena`).
- `APURANDO → FINALIZADA` acontece **automaticamente** ao rodar a apuração
  (módulo `apuracao-sena`).

### Job automático de ciclo de vida

`EdicoesSenaCicloVidaService` — fila BullMQ, roda a cada 30s por padrão
(`EDICOES_SENA_CICLO_VIDA_INTERVAL_MS`), desligável via
`EDICOES_SENA_CICLO_VIDA_ENABLED=false`, precisa de `REDIS_URL`, pulado em
`NODE_ENV=test`. A cada execução:

1. **Encerra expiradas**: qualquer `ATIVA` com `dataEncerramento <= agora`
   vira `ENCERRADA` (em lotes de 20).
2. **Ativa a próxima**: se não há nenhuma `ATIVA`, promove automaticamente a
   próxima `RASCUNHO` (ordenada pelo `dataSorteioMegaSena` mais próximo no
   futuro) para `ATIVA`.

Ou seja: normalmente ninguém precisa clicar em "ativar"/"encerrar" na mão —
o job mantém sempre uma edição ativa, na ordem cadastrada.

---

## Fluxo de compra

Módulo: `src/modules/capital-sena/vendas-sena/vendas-sena.service.ts`,
método `create()`.

1. **Edição**: precisa existir, estar `ATIVA`, e `agora < dataEncerramento`.
2. **Vendedor/origem**: resolve `seller_id` (da URL da loja, `?seller_id=`)
   num `vendedorId`/`distribuidorId`, checando o perfil do `Usuario`
   correspondente (ou tratando `seller_id` diretamente como id de vendedor ou
   distribuidor). Sem match → `NotFoundException`.
3. **Combo** (se `comboSenaId` informado): precisa ser um combo `ativo` desta
   edição. Define a quantidade de cartelas esperada.
4. **Cartelas**: o frontend manda os números prontos — array de
   `{ numeros: number[6], bola_extra: number }`. Validação: 6 números únicos
   entre 1–60; bola extra entre 1–60 e diferente dos 6 principais. Se há
   combo/quantidade definida, a quantidade de cartelas enviada precisa bater
   exatamente (senão `BadRequestException` citando o nome do combo).
5. **Cliente**:
   - Com `clienteId`: busca o cliente existente, atualiza vendedor/
     distribuidor pro relacionamento mais recente se mudou.
   - Sem `clienteId`: exige `cpf`, `nome` e `telefone` (e-mail e data de
     nascimento são opcionais). Cria o cliente se o CPF não existir; se
     existir mas não tiver data de nascimento salva e uma foi enviada agora,
     preenche a lacuna. Maioridade só é validada quando há data cadastrada —
     nunca bloqueia por falta dela (a tela de login do Sena nem pede essa
     data, então isso seria uma trava sem saída — ver seção de acesso do
     cliente).
6. **Vendedor/distribuidor**: se IDs foram informados, precisam existir; se só
   veio `vendedorId`, o `distribuidorId` herda do distribuidor daquele
   vendedor. Se o usuário logado é `VENDEDOR`/`DISTRIBUIDOR`, o id dele sempre
   prevalece sobre o que veio no corpo da requisição.
7. **Tipo de pagamento**: se quem está logado é `ADMIN`, a venda é sempre
   forçada pra `MANUAL` (aprovada na hora, sem gateway), não importa o que
   foi enviado. Fora isso, aceita `PIX`, `CARTAO` ou `MANUAL` como veio.
8. **Total**: `combo.preco` se houver combo, senão
   `edicao.valorCartela × quantidade de cartelas`.
9. **Ramificação**:
   - **MANUAL**: tudo numa transação — cria a `VendaSena` já `APROVADO`, cria
     as `CartelaSena` já `CONFIRMADA`, gera comissão. Sem chamada a gateway.
   - **PIX/CARTAO**: cria a `VendaSena` como `PENDENTE`, guarda `modoSelecao`
     e os números/bola extra dentro de `gatewayPayload.numeros` — **as
     cartelas ainda não existem em `CartelaSena` neste ponto**. Chama o
     gateway (`PaymentGatewayFactory`) e salva `gatewayId` +
     `gatewayPayload`. Se o gateway falhar: com `requireGateway`, marca
     `RECUSADO` e lança erro; sem essa flag, engole o erro e devolve a venda
     sem dados de pagamento.

### Confirmação de pagamento

`confirmarPagamento(vendaSenaId, gatewayPayload?)` — chamado pelos webhooks
dos 4 gateways (Mercado Pago, AgilizePay, FSPay, PagBank; todos em
`pagamentos.service.ts`, que primeiro tenta achar a venda em `Venda` do
Capital Prêmios e só cai pra `VendaSena` se não achar). Exige que a venda
esteja `PENDENTE`. Recupera os números guardados em `gatewayPayload`,
revalida, e **só agora** cria as `CartelaSena` (`CONFIRMADA`), vira a venda
`APROVADO` e gera as comissões — tudo numa transação.

Diferença notável do fluxo do Capital Prêmios: o Sena **não** dispara
notificação n8n na confirmação (isso é exclusivo do Capital Prêmios). Depois
de confirmar, dispara e-mail de "compra aprovada" — que simplesmente não faz
nada se o cliente não tiver e-mail cadastrado.

### Cancelamento

`cancelar(id, motivo?)`: bloqueia cancelamento duplo; apaga as `CartelaSena`
da venda; se existe `ComissaoSena`, desconta o valor do saldo do vendedor e
apaga a comissão; tenta cancelar a cobrança no gateway (melhor esforço, só
loga aviso se falhar); marca `CANCELADO` com motivo/data no `gatewayPayload`.

**Inconsistência conhecida**: o cancelamento reverte a comissão do vendedor,
mas **não** reverte `ComissaoDistribuidorSena`/o saldo do distribuidor. Se uma
venda gerou comissão pro distribuidor também, cancelar a venda deixa esse
valor no saldo dele indevidamente.

---

## Apuração

Dois módulos distintos que atuam em sequência — fácil de confundir os nomes:

| Módulo | O que faz | Transição de status |
|---|---|---|
| `sorteio-sena` | Cadastro manual do resultado real da Mega-Sena | `ENCERRADA → APURANDO` |
| `apuracao-sena` | Compara cartelas com o resultado e atribui prêmios | `APURANDO → FINALIZADA` |

### 1. Inserir o resultado (`sorteio-sena`)

`inserirResultado(edicaoSenaId, dto)` — só permitido com a edição
`ENCERRADA` ou `APURANDO`. Valida 6 números únicos (1–60) e, se veio
`setimaBola`, que ela não repete um dos 6. Aceita upload opcional de imagem
do resultado oficial (print da Mega-Sena, por exemplo).

Faz **upsert** por `edicaoSenaId` — o mesmo endpoint serve tanto pra criar
quanto pra corrigir o resultado (`POST` e `PUT` chamam o mesmo método). Ao
corrigir, **reseta `apurado: false` / `apuradoEm: null`** — ou seja, editar o
resultado depois de já ter apurado libera rodar a apuração de novo. Isso
**não** desfaz o que já foi gravado em `CartelaSena` (status/acertos da
apuração anterior) nem reverte a edição de `FINALIZADA` — só destrava a
apuração rodar de novo por cima. Se a edição estava `ENCERRADA`, vira
`APURANDO` neste passo.

### 2. Rodar a apuração (`apuracao-sena`)

`apurar(edicaoSenaId)` — **não é idempotente**: exige a edição em
`APURANDO`, exige que exista um `resultado`, e recusa (`ConflictException`)
se `resultado.apurado` já é `true`. Pra rodar de novo, precisa reenviar um
resultado (mesmo que idêntico) via `sorteio-sena` primeiro, pra resetar o
`apurado`.

Lógica por cartela (só cartelas `CONFIRMADA` entram):

```
sorteados = { os 6 números reais }
acertos = quantos dos 6 números da cartela estão em sorteados

se acertos == 6:
    se existe setimaBola cadastrada:
        setimoAcertou = (bola extra da cartela == setimaBola)
    senão (setimaBola não informada):
        setimoAcertou = (bola extra da cartela ∈ sorteados)   // fallback
    status = SENA_BONUS se setimoAcertou, senão SENA
senão se acertos == 5: status = QUINA
senão se acertos == 4: status = QUADRA
senão:                 status = NAO_PREMIADA
```

Ao final, numa transação: marca `resultado.apurado = true` +
`apuradoEm = agora`, e a edição vira `FINALIZADA`.

`resumo(edicaoSenaId)` — exige apuração feita; devolve contagem por faixa
(`totalCartelas`, `naoPremidas`, `quadras`, `quinas`, `senas`, `senaBonus`) e
os números sorteados.

`listarGanhadores(edicaoSenaId, page, limit)` — lista paginada das cartelas
premiadas (`QUADRA`+), ordenada por faixa e depois por acertos, com dados do
comprador (nome, CPF, telefone) e do vendedor.

### Endpoint público de resultado

`GET /capital-sena/resultado/:edicaoSenaId` — sem autenticação, devolve
descrição/data/status da edição, o resultado (números, bola extra, imagem,
flag `apurado`) e a lista de prêmios.

---

## Comissões

Geradas de forma síncrona, dentro da mesma transação da aprovação da venda
(seja no `create()` pra `MANUAL`, seja no `confirmarPagamento()` pra
PIX/CARTAO confirmados), pela mesma rotina `gerarComissaoSena`:

- Vendedor: se `Vendedor.comissaoPercent > 0`, cria `ComissaoSena` com
  `valor = total × comissaoPercent / 100` e soma ao `saldo` do vendedor.
- Distribuidor: mesma lógica, independente, usando `distribuidorId` (o da
  venda ou o do vendedor), criando `ComissaoDistribuidorSena` e somando ao
  `saldo` do distribuidor.

As duas podem disparar na mesma venda (comissão do vendedor + comissão do
distribuidor dele, ao mesmo tempo). Os percentuais são **por registro**
(`Vendedor.comissaoPercent`/`Distribuidor.comissaoPercent`), não um valor
global — existe um `ConfiguracaoComissao` (percentuais default), mas nada no
fluxo do Sena (nem do Capital Prêmios) lê essa configuração hoje.

### Saque

**Não existe fluxo de saque funcional no sistema, para nenhum dos dois
produtos.** `SaquesService.findAll()` sempre devolve uma lista vazia
hard-coded, e não há nenhum caminho de código que crie uma linha em `Saque`.
O schema (`Saque`/`StatusSaque`/`TipoSaque`) existe, mas comissões hoje só
acumulam em `Vendedor.saldo`/`Distribuidor.saldo` sem nenhum mecanismo de
pagamento dentro do app.

---

## Acesso do cliente (login / minhas compras)

`POST /auth/loja` é **totalmente compartilhado** com o Capital Prêmios — não
existe um endpoint de login separado pro Sena. Regras:

- **Cliente novo** (CPF não cadastrado): exige `cpf` + `nome` + `telefone` +
  `dataNascimento`.
- **Cliente existente sem data de nascimento salva**: login **não bloqueia**.
  Isso é proposital — o formulário de login do Sena só pede CPF, sem campo
  pra data de nascimento, então exigir a data aqui travaria todo cliente
  vindo do Sena (que nunca teve chance de informar essa data). Se a data vier
  informada mesmo assim (fluxo do Capital Prêmios, que ainda pergunta),
  preenche a lacuna do cadastro.
- **Cliente existente com data salva**: valida maioridade normalmente.

Endpoints de auto-atendimento do cliente logado:

- `GET /capital-sena/minhas-compras` — lista as `VendaSena` do CPF do token
  (paginado, com edição/cliente/vendedor/cartelas).
- `GET /capital-sena/minhas-cartelas` — lista por cartela em vez de por
  venda, filtrável por edição, só cartelas de vendas `APROVADO`.

---

## Operações administrativas

Além do que o cliente público pode fazer, o painel admin (`admin/capital-
sena/*`) permite:

- **Edições**: CRUD completo + ativar/encerrar/remover (mutações só ADMIN).
- **Vendas**: registrar venda em nome de um cliente
  (`POST /admin/capital-sena/vendas`, ADMIN/DISTRIBUIDOR/VENDEDOR — ADMIN
  sempre vira `MANUAL`/aprovada na hora); cancelar (só ADMIN).
- **Sorteio**: inserir/corrigir o resultado oficial (só ADMIN).
- **Apuração**: rodar a apuração e ver resumo/ganhadores (rodar é só ADMIN;
  ver é ADMIN/DISTRIBUIDOR/VENDEDOR).
- **Cartelas**: listar todas as cartelas de uma edição com dados de
  comprador/vendedor.
- **Relatórios**: dashboards com séries temporais e comissões específicas do
  Sena, separadas das do Capital Prêmios (mas lendo do mesmo `saldo`).

### Outros canais que registram vendas Sena

- **POS** (maquininha física): `POST /pos/capital-sena/vendas` — só PIX,
  origem resolvida pelo token de autenticação do POS, confirmação por
  polling em vez de webhook direto.
- **WhatsApp API**: `POST /whatsapp/sena/pedidos` — cria pedido + cobrança
  PIX numa chamada só, pensado pra um bot de vendas.

---

## Integração de pagamento

Totalmente compartilhada com o Capital Prêmios — não existe gateway
exclusivo do Sena. `VendasSenaService` usa a mesma `PaymentGatewayFactory`:

- `PIX` → resolve pelo env `PIX_GATEWAY_PROVIDER` (`FSPAY` por padrão;
  `AGILIZEPAY`/`PAGBANK`/`MERCADOPAGO` como alternativas), a menos que
  `MOCK_PIX_AUTO_APPROVE=true`, que força o `MockPixGateway` (usado em dev).
- `CARTAO` → sempre `PagBankCartaoGateway`.
- `MANUAL` → nunca chega a chamar gateway.

Pra **consultar/cancelar** uma cobrança já criada, a factory não confia no
provedor atual configurado no env — ela inspeciona qual chave existe dentro
do `gatewayPayload` salvo (`mercadoPagoResponse`/`pagbankResponse`/
`agilizepayResponse`/`fspayResponse`) pra saber qual provedor realmente
originou aquela cobrança. Isso evita quebrar cobranças pendentes se alguém
trocar o provedor configurado no meio do caminho.

Os 4 webhooks (Mercado Pago, AgilizePay, FSPay, PagBank) vivem todos em
`pagamentos.service.ts` e servem os dois produtos: cada handler primeiro
procura a cobrança em `Venda` (Capital Prêmios) e só cai pra `VendaSena` se
não achar.
