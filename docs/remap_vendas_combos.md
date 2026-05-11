# Remap de Integração: Vendas, Combos e Edições

Este documento descreve as recentes atualizações arquiteturais e de regras de negócio na API do Capital de Prêmios. Ele serve como um guia **prático** para o time de Frontend entender como formatar as requisições, payloads (multipart vs json) e lidar com os retornos (antes vs depois).

---

## 1. Cadastro de Edição e Imagens dos Prêmios

**Rota:** `POST /admin/edicoes` (e `PATCH /admin/edicoes/:id`)  
**Content-Type:** `multipart/form-data`

### Como era antes
- A criação de combos (`quantidadeCartelas`) era rigidamente limitada a no máximo 12 cartelas.
- As faixas de bilhetes dependiam de gerações manuais e isoladas.

### Como é hoje
- A trava de 12 cartelas **foi removida**. Agora o sistema aceita qualquer número inteiro positivo no combo.
- As cartelas utilizam a integração direta com a Matriz Global de ranges.
- **Upload de Imagens dos Prêmios:** O endpoint recebe requisições `multipart/form-data`. Campos complexos como os prêmios, combos e detalhes devem ser enviados como **JSON em String (`JSON.stringify()`)**. Já as imagens, são enviadas como arquivos binários. 
- **O pulo do gato:** A API mapeia automaticamente os arquivos enviados no array binário `premioImagens` para os objetos de prêmio descritos no JSON stringificado `premios`, **seguindo a exata mesma ordem** dos índices do array.

**Exemplo de Payload (FormData):**
```text
numero: "Edição 001"
dataSorteio: "2026-05-20T20:00"
raspadinha: "false"
destino: "AMBOS"

// ⚠️ Os campos abaixo são enviados como Strings formatadas em JSON
combos: '[{"origemParticipacao":"DIGITAL","quantidadeCartelas":15,"preco":"50.00"}]'
detalhes: '{"DIGITAL":[{"indiceRange":1,"rangeInicio":"0000001","rangeFinal":"0001000"}]}'

// Array de prêmios em String JSON
premios: '[{"descricao":"Carro 0km","valor":"50000.00"}, {"descricao":"Moto 0km","valor":"15000.00"}]'

// Arquivos Binários (Files)
imagem: [File] // Imagem principal da edição
premioImagens: [File1_do_Carro, File2_da_Moto] // O array de files DEVE TER a mesma ordem do array JSON de premios!
```

**Response de Sucesso (Exemplo Simplificado):**
```json
{
  "statusCode": 200,
  "message": "Operação realizada",
  "data": {
    "id": "uuid-da-edicao",
    "numero": "Edição 001",
    "imagemUrl": "https://s3.amazonaws.com/...edicao.jpg",
    "premios": [
      {
        "ordem": 1,
        "descricao": "Carro 0km",
        "imagemUrl": "https://s3.amazonaws.com/...carro.jpg" 
      },
      {
        "ordem": 2,
        "descricao": "Moto 0km",
        "imagemUrl": "https://s3.amazonaws.com/...moto.jpg" 
      }
    ]
  }
}
```

---

## 2. Como Comprar: Cartela Única vs Combo (Carrinho de Compras)

**Rota:** `POST /admin/vendas` (para admin/vendedores) ou as rotas do checkout.  
**Content-Type:** `application/json`

> **Dicionário Rápido para Facilitar o Entendimento**
> - **Cartela (ou Bilhete):** É a unidade, um único número da sorte (ex: `1234567`).
> - **Combo:** É um pacote/promoção que contém várias cartelas juntas por um preço especial (ex: "Três chances" = 1 combo de 3 cartelas).

---

### Cenario A: Comprando CARTELAS ÚNICAS (Avulsas)
*Quando o cliente quer comprar apenas unidades soltas (sem usar pacotes promocionais).*

**Opção 1: O Cliente Escolheu os Números na Tela**
Você usa o array `combosSelecionados` para enviar os números. (O nome do campo da API é "combosSelecionados" por padrão histórico, mas ele aceita cartelas únicas perfeitamente).
```json
{
  "edicaoId": "uuid-da-edicao",
  "quantidade": 2, // Ele está comprando 2 cartelas avulsas
  "combosSelecionados": ["1234567", "7654321"], // 👈 Os 2 bilhetes EXATOS que ele clicou!
  "cpf": "12345678900",
  "nome": "João Silva",
  "telefone": "61999999999",
  "tipoPagamento": "PIX"
}
```

**Opção 2: Surpresinha (Aleatório)**
O cliente não quer escolher. Ele só clica no botão "Quero comprar 2 cartelas". Você **NÃO ENVIA** o array de números escolhidos.
```json
{
  "edicaoId": "uuid-da-edicao",
  "quantidade": 2, // Ele quer 2 bilhetes aleatórios no total
  "quantidadeCartelas": 1, // 👈 Isso diz à API: "Estes são bilhetes de cartela ÚNICA"
  "cpf": "12345678900",
  "nome": "João Silva",
  "telefone": "61999999999",
  "tipoPagamento": "PIX"
}
```
*(O backend sorteará 2 números diferentes para ele automaticamente).*

---

### Cenario B: Comprando COMBOS (Pacotes de Cartelas)
*Quando o cliente seleciona um pacote na interface (ex: "Pacote 3 Chances").*

**Opção 1: O Cliente Escolheu o Combo na Tela e Sabe o Número Base**
Se a interface permitir que o cliente escolha o número do combo (geralmente ele clica no 1º número e os outros vão em sequência amarrados), envie apenas o número base no array.
```json
{
  "edicaoId": "uuid-da-edicao",
  "quantidade": 1, // Ele está comprando 1 COMBO INTEIRO
  "quantidadeCartelas": 3, // 👈 O combo escolhido tem 3 cartelas ("Três Chances")
  "combosSelecionados": ["1234567"], // 👈 O número principal do pacote!
  "cpf": "12345678900",
  "nome": "João Silva",
  "telefone": "61999999999",
  "tipoPagamento": "PIX"
}
```
*(O backend processará o `1234567` e já associará as cartelas ligadas a esse combo automaticamente).*

**Opção 2: Surpresinha de Combo (Aleatório)**
O cliente quer comprar "2 pacotes de 3 chances", aleatórios.
```json
{
  "edicaoId": "uuid-da-edicao",
  "quantidade": 2, // Ele quer 2 combos diferentes
  "quantidadeCartelas": 3, // 👈 Cada combo tem 3 bilhetes (3 chances)
  "cpf": "12345678900",
  "nome": "João Silva",
  "telefone": "61999999999",
  "tipoPagamento": "PIX"
}
```
*(O backend sorteará 2 pacotes aleatórios de 3 bilhetes para ele, resultando em 6 cartelas entregues).*

---

## 4. Listagem e Visualização de Cartelas

**Rota a não usar:** `GET /bilhetes`

### Como era antes
- O Frontend chamava a rota `GET /bilhetes` com paginação para carregar listas gigantescas do banco de dados e checar a disponibilidade para renderizar na tela.

### Como é hoje
- **Descontinuado:** A busca isolada de bilhetes via endpoint principal foi ocultada. A regra exige não varrer milhares de registros isolados do banco de uma vez só.
- **Como renderizar agora:** A visualização de números baseia-se nos **Ranges (matriz) da Edição**. O Frontend consome os detalhes da edição (`GET /admin/edicoes/:id`), encontra o `rangeInicio` e o `rangeFinal`, e **renderiza virtualmente** a grade (os quadrados dos bilhetes) do menor ao maior número.
- **Validação de Disponibilidade:** A conferência final se o número selecionado na tela de fato está livre ou se alguém comprou nos últimos 2 segundos acontece no momento de chamar a API de venda (`POST /admin/vendas` via `combosSelecionados`). Se o número escolhido não estiver disponível, a API recusará a compra com clareza.
- **Alternativa (Preview de WhatsApp):** Para fluxos estritos (como o do Bot do WhatsApp), a API oferece uma rota específica `POST /whatsapp/campanhas/:id/cotas/preview` que retorna combos abertos (sem reservar) que o cliente pode observar antes de fechar o negócio.
