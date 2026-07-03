# Capital de Prêmios API — Arquitetura e Regras de Negócio

Este documento resume a infraestrutura, engenharia, ciclo de vida e as principais regras de negócios (incluindo as últimas implementações) do projeto **Capital de Prêmios**.

---

## 1. Perfis e Hierarquia de Acesso

O sistema roda nativamente baseado em uma hierarquia (Tier System) enraizada no sistema de autenticação JWT, distribuindo-se em 4 perfis globais:

1. **ADMIN**: Acesso supremo. Cria edições (sorteios), credencia distribuidores, edita porcentagens de comissões matrizes, visualiza dashboards globais e pode auditar ou cancelar vendas em tempo real.
2. **DISTRIBUIDOR**: Acima do vendedor final. São pontes financeiras e logísticas. Podem cadastrar e recrutar Vendedores. Os distribuidores recebem sua comissão (chamada comumente de "Spread") sobre as vendas de seus agentes locais vinculados.
3. **VENDEDOR**: Ponto de contato na ponta final da cadeia. O vendedor cria clientes (em compras rápidas POS "Ponto de Venda") e oferta bilhetes. **Sempre pertence a um Distribuidor.**
4. **CLIENTE (Final)**: Consumidor do bilhete. Cria-se autonomamente ao fazer checkout pela **Loja Pública** utilizando o CPF ou tem o cadastro efetuado por um Vendedor. Não detém acesso ao painel admin, apenas à recuperação e visualização das suas compras públicas (Painel Cliente).

> [!NOTE]
> **Vínculo Transparente de Identidade**: Devido às últimas melhorias, sempre que um usuário do tipo Vendedor ou Distribuidor realiza uma compra direta para um cliente via Painel Administrativo, a API detecta internamente (via Token JWT) o autor real da operação, garantindo transparência impenetrável e blindando os campos `vendedorId` e `distribuidorId`, prevenindo fraudes de front-end. O back-end é 100% "source of truth".

---

## 2. Produtos (Edições) e Modalidades de Chance

Os sorteios operam centralizados através da entidade `Edicao`.

- As edições podem operar simultaneamente (ou isoladas) com matrizes de números distintas.
- Títulos de bilhetes (Tipos de Cartela) trafegam de `UMA_CHANCE` a `DOZE_CHANCES`. Com a estrutura relacional de `MatrizRange`, um único "combo" (Número Base) pode se desdobrar matricialmente pelas múltiplas chaves numéricas no prisma, garantindo o "salto" matemático adequado imposto no backend.
- A **Origem de Participação** atesta se a cartela foi produzida e vendida para ambiente on-line (`DIGITAL`), em guichets autorizados (`FISICO`), ou `POS`.

### Flexibilidade e Tratamento de Combos

Ao abrir o painel de listagem de números de uma edição:
- Por baixo dos panos, o backend (`listarCombosDisponiveis`) extrai as variações, limites (Limit / Cursor) e disponibilidades puras remanescentes da edição.
- **Tolerância a falhas configuracionais**: Caso existam falhas na requisição (ex.: buscar cartelas do tipo "Seis Chances - Físico" em uma edição que é apenas 100% digital), em vez de estourar retornos grosseiros, o sistema intercepta de forma silenciosa e polida retornando uma listagem limpa `[]` via cache nativo transparente, informando visualmente a indisponibilidade.

---

## 3. Gestão e Faturamento de Vendas

A Venda é a veia carótida monetária do sistema. A transação opera em 2 modos:

### A) Compra Rápida (Aleatória)
O Cliente/Vendedor informa apenas a `quantidade` desejada. Na confirmação do pagamento, a API resgata sequências matemáticas matriz/randomizadas liberadas em banco e as "trava" pro cliente instantaneamente.

### B) Compra Específica (Com Combos Selecionados)
Tanto o lojista como o consumidor agora dispõem do direito à curadoria local dos seus "números da sorte".
Passando array simples contendo os IDs primários (Ex: `combosSelecionados: ["012015", "033917"]`), se estiverem desocupados na concorrência da base, são reservados e processados isoladamente.

### Ciclo de Pagamento Transacional (Transações ACID)
1. Nasce status **PENDENTE**. Dispara Webhook/PIX no Gateway.
2. Cliente paga -> O Gateway grita para a API via Webhooks internos.
3. Se o saldo / webhook confere, dispara Status **APROVADO**.
4. Disparam simultaneamente 2 subrotonas numa _Transaction_ do banco de dados (ACID):
   - **Alocação Rápida**: Criação dos bilhetes e ligação irreversível com os ranges matemáticos para impedir compra duplicata.
   - **Gestão De Comissões Macros & Micros**.

---

## 4. O Coração de "Splits" Financeiros (Comissionamento)

As regras de divisão de comissionamento são de hierarquia de "cascata top-down":

- Quando a Venda é fatura, o sistema identifica se existe o selo/ID de `distribuidorId`.
- Calcula o lucro primário bruto (Base da Regra do Fator Distribuidor).
- Ocorrendo `vendedorId`, o software destaca o "fator Vendedor": retira uma percentagem do pote que era originalmente do Distribuidor base, jogando perfeitamente esse saldo ao caimento do Vendedor. O Vendedor possui seu fundo e o distribuidor lucra no que denominamos de "Spread Remanescente", creditando ambas as tabelas financeiras ao centavo.
- Quando ocorrem *Estornos/Cancelamentos*, a transação é revertida retirando os saldos devidos nas carteiras.

---

## 5. Dinâmica em Tempo Real: Firebase e Sorteios

O Core de sorteio desvia propositalmente da utilização de WebSockets nativizados pelo nest para evitar fadigas de conexões/drops por hardware ou pool limits. Foi desenhado e orientado ao serviço Real-time do **Firebase Firestore SDK**.
Os administradores inserem via painel as aberturas das bolas do sorteio, que injeta nos nodes do Firestore. Como consequência, o aplicativo móvel/frontend web reflete com delay sub-sec a revelação interativa final na tela do dispositivo hospedeiro.

---

## Conclusões Recentes do Development

As implementações recentes conferiram confiabilidade total em nível de Controller/Services:
1. Retirada de exposições de documentação em rotas invisíveis / sensíveis (`BilhetesController`).
2. Robustez dos logs da camada JSON de payload dos Gateways (`gatewayPayload`), aguentando informações complexas dos bilhetes (`combosSelecionados`).
3. Comandos auto-geradores nativos no core da raiz (`npm run deploy:homolog`), que empacota deploys estáticos transparentes integrando reboots via `pm2`, otimizando a fase atual da obra rumo à perfeição para o cliente.
