# POS — Combos e Preenchimento de Cliente por CPF

Este documento consolida a orientação para a integração do POS em dois pontos:

1. como vender **combo** sem cair em compra unitária
2. como o POS pode **buscar os dados do cliente pelo CPF** para preencher a venda

---

## 1. Problema reportado

O integrador do POS informou dois comportamentos:

1. ao enviar compra de combo, a API retornou valor de compra unitária
2. o POS não tem hoje uma rota própria para consultar os dados do cliente ao digitar o CPF

---

## 2. Causa do problema no combo

No fluxo atual do POS:

- `tipoCartela` **não é aceito** no body de `POST /api/pos/vendas`
- o campo `tipoCartela` é usado apenas na navegação/listagem de combos
- se o POS mandar apenas `quantidadeCartelas: 2` sem `comboId`, a venda pode ser interpretada como compra unitária em quantidade

Erro já observado:

```json
{
  "statusCode": 400,
  "message": "Dados inválidos",
  "data": null,
  "errors": [
    {
      "campo": "tipoCartela",
      "mensagem": "property tipoCartela should not exist"
    }
  ]
}
```

---

## 3. Regra correta para compra de combo no POS

Para uma compra de combo no POS, o integrador deve seguir este fluxo:

1. autenticar o operador em `POST /api/pos/auth/login`
2. listar as edições ativas em `GET /api/pos/edicoes`
3. listar as opções da edição em `GET /api/pos/edicoes/{edicaoId}/opcoes`
4. identificar a opção `tipoCompra: "COMBO"` com a `quantidadeCartelas` desejada
5. navegar os combos disponíveis em `GET /api/pos/edicoes/{edicaoId}/combos?quantidadeCartelas={N}`
6. reservar os bilhetes do combo em `POST /api/pos/edicoes/{edicaoId}/reservas`
7. criar a venda em `POST /api/pos/vendas`

---

## 4. Diferença importante entre reserva e venda

### Reserva do combo

Na reserva, o POS deve enviar **todos os bilhetes** do combo retornados em `comboAtual.bilhetes`.

Exemplo:

```json
{
  "cartelas": ["0951004", "0953004"]
}
```

### Criação da venda do combo

Na venda, o POS deve enviar:

- `comboId`: identificador da configuração do combo da edição
- `quantidadeCartelas`: quantidade de cartelas daquele combo
- `combosSelecionados`: array com o **numeroBase** do combo escolhido

Exemplo:

```json
{
  "edicaoId": "6b14b746-7537-454e-9b2e-da03004ea576",
  "comboId": "UUID_DO_COMBO_DUAS_CHANCES",
  "quantidadeCartelas": 2,
  "tipoPagamento": "PIX",
  "combosSelecionados": ["0951004"],
  "cpf": "14070643630",
  "nome": "Jonathan Ramses Alves Borges",
  "telefone": "(35) 98881-2271",
  "email": "abjonathan09@gmail.com",
  "dataNascimento": "1998-07-31"
}
```

---

## 5. O que o integrador do POS não deve fazer

Não enviar este payload:

```json
{
  "edicaoId": "6b14b746-7537-454e-9b2e-da03004ea576",
  "quantidadeCartelas": 2,
  "tipoPagamento": "PIX",
  "cpf": "14070643630",
  "nome": "Jonathan Ramses Alves Borges",
  "telefone": "(35) 98881-2271",
  "dataNascimento": "1998-07-31",
  "email": "abjonathan09@gmail.com",
  "combosSelecionados": ["0951004", "0953004"]
}
```

Motivos:

- sem `comboId`, a API pode precificar como compra unitária
- em `combosSelecionados`, a venda de combo deve receber o `numeroBase`, não todos os bilhetes
- `tipoCartela` não deve ser enviado no body de `POST /api/pos/vendas`

---

## 6. Resumo rápido para repassar ao integrador

### Combo no POS

- usar `GET /api/pos/edicoes/{edicaoId}/opcoes` para descobrir o combo correto
- usar `GET /api/pos/edicoes/{edicaoId}/combos?quantidadeCartelas={N}` para navegar
- usar `POST /api/pos/edicoes/{edicaoId}/reservas` com todos os bilhetes do combo
- usar `POST /api/pos/vendas` com `comboId` + `combosSelecionados` contendo apenas o `numeroBase`
- não enviar `tipoCartela` no body da venda

---

## 7. Situação atual da busca de cliente por CPF

Hoje já existe busca de cliente por CPF no painel administrativo:

- `GET /api/admin/clientes/cpf/:cpf`

Porém esta rota:

- exige token do painel admin
- não pode ser usada com token do POS
- não resolve o autofill do terminal físico

---

## 8. Novo endpoint proposto para o POS

Status: **proposto neste documento, ainda não implementado**

Objetivo: permitir que o POS consulte um cliente já existente pelo CPF e preencha automaticamente os campos da venda.

### Rota

```http
GET /api/pos/clientes/cpf/:cpf
Authorization: Bearer <token-pos>
```

### Regras

- autenticação via token do POS
- acesso permitido para `VENDEDOR` e `DISTRIBUIDOR`
- consulta limitada à hierarquia do operador autenticado
- CPF pode ser enviado com ou sem máscara
- se encontrar cliente, retornar dados prontos para preencher a tela
- se não encontrar cliente, retornar resposta simples para o POS seguir com preenchimento manual

### Exemplo de request

```http
GET /api/pos/clientes/cpf/14070643630
Authorization: Bearer <token-pos>
```

### Resposta esperada quando encontrar

```json
{
  "statusCode": 200,
  "message": "Cliente encontrado com sucesso",
  "data": {
    "encontrado": true,
    "cliente": {
      "id": "uuid-do-cliente",
      "cpf": "14070643630",
      "nome": "Jonathan Ramses Alves Borges",
      "telefone": "(35) 98881-2271",
      "email": "abjonathan09@gmail.com",
      "dataNascimento": "1998-07-31",
      "cidade": "Boa Esperanca",
      "estado": "MG"
    }
  }
}
```

### Resposta esperada quando nao encontrar

```json
{
  "statusCode": 200,
  "message": "Cliente nao encontrado",
  "data": {
    "encontrado": false,
    "cliente": null
  }
}
```

### Campos minimos para autofill no POS

Os campos que o POS deve reaproveitar quando o cliente existir sao:

- `cpf`
- `nome`
- `telefone`
- `email`
- `dataNascimento`

Campos opcionais para exibir ou armazenar localmente:

- `cidade`
- `estado`

---

## 9. Fluxo sugerido de preenchimento no POS

1. operador digita o CPF
2. POS chama `GET /api/pos/clientes/cpf/:cpf`
3. se `encontrado = true`, preencher automaticamente:
   - nome
   - telefone
   - email
   - data de nascimento
4. se `encontrado = false`, liberar preenchimento manual
5. ao finalizar a venda, enviar os dados completos em `POST /api/pos/vendas`

---

## 10. Payload final esperado para venda POS com autofill

Exemplo com cliente ja encontrado:

```json
{
  "edicaoId": "6b14b746-7537-454e-9b2e-da03004ea576",
  "comboId": "UUID_DO_COMBO_DUAS_CHANCES",
  "quantidadeCartelas": 2,
  "tipoPagamento": "PIX",
  "combosSelecionados": ["0951004"],
  "cpf": "14070643630",
  "nome": "Jonathan Ramses Alves Borges",
  "telefone": "(35) 98881-2271",
  "email": "abjonathan09@gmail.com",
  "dataNascimento": "1998-07-31"
}
```

---

## 11. Recomendacao de implementacao

Para eliminar a ambiguidade no POS, a integracao deve considerar obrigatorio para combo:

- `comboId`
- `quantidadeCartelas`
- `combosSelecionados` com o `numeroBase`

E deve considerar como novo requisito funcional:

- endpoint POS de consulta de cliente por CPF para autofill da venda

