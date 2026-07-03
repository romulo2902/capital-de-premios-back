# Handover: Capital de Prêmios API (Dev -> Codex)

> [!IMPORTANT]
> **Este documento contém todo o contexto do sistema atual, arquitetura consolidada e as modificações feitas durante esta sessão para que você, Codex ou GPT-4, continue de onde eu parei.**

## 1. Stack e Infraestrutura
* **Linguagem**: TypeScript (Node.js 20)
* **Framework**: NestJS (v10) + Decorators rígidos (swagger/class-validator)
* **Banco de Dados**: PostgreSQL com ORM Prisma (`@prisma/client`)
* **Executando**: `yarn start:dev` e build via `yarn build`.

## 2. Padrões Inegociáveis (Rules)
* Nenhum DTO deve ser usado sem as tipagens explícitas do `@nestjs/swagger` (`@ApiProperty`, `@ApiPropertyOptional`).
* **Regra de Error Handling**: Todas excessões trafegam via excecões nativas do NestJS (`NotFoundException`, `UnauthorizedException`, etc).
* As variáveis de ambiente SEMPRE são consultadas via Inject do `ConfigService`, nunca iteradas estaticamente em arquivos puramente lógicos usando o `process.env`.
* Nunca use `any` ou perca a rigidez do TypeScript.
* Após quaisquer mudanças cruciais no modelo Prisma, deve acionar a CLI (`npx prisma migrate dev` e `prisma generate`).

## 3. Estado Atual e Autenticação Refatorada

O sistema teve a sua camada de acesso totalmente modernizada. 

Ao invés de diferentes painéis ou endpoints complexos pro ecossistema interno, estabelecemos a regra:

### 3.1 Nível Administrativo (O Painel Interno)
**Perfis**: `ADMIN`, `DISTRIBUIDOR`, `VENDEDOR`.
Todos eles acessam a aplicação *via a mesma porta de entrada*: `POST /api/auth/login` informando **Email e Senha**.
O sistema cruza um Hash bcrypt, autentica as roles e as devolve atreladas a um Access Token e a flag de submetadados das hierarquias (ex: O token devolverá ao distribuidor apenas recursos dos domínios em cascata abaixo dele).

* **Organização**: Toda e qualquer rota pertencente a funções de admin, distribuidores e operacionais está sob o escopo `@Controller('admin/nome-da-entidade')`.
* **Segurança**: Feitas via injeção dos Guards (`JwtAuthGuard` e `RolesGuard`).

> [!NOTE]
> Anteriormente, Vendedores e Distribuidores usavam as rotas raiz (`/vendedor`, `/distribuidor`). Estes módulos antigos foram permanentemente marcados como `lixo` estático e apagados. Tudo foi migrado pra raiz do `/admin/*` usando Roles.

### 3.2 Nível Loja Pública (O Cliente Final)
A fachada para os compradores foi construída no módulo independente e isolado `loja-publica`. 
Aqui, o comprador consome o catálogo da edição sem tokens bloqueantes e prossegue no fluxo `POST /loja/comprar` passando os DTOs do pedido para ser cobrado e amarrado em sua cartela.

* **Login por CPF**: Foi construída uma portaria única em `POST /api/auth/loja`. O cliente só entra com seu CPF.
* **Política de Novo Cliente:** Antes era permitido criar um usuário no PIX sem informar nada, agora **É ILEGAL CRIAR CLIENTE SEM CAMPOS INDEX**. Na rota `POST /auth/loja`, se o CPF mandado não existir, devolvemos erro `401 Unauthorized` obrigando o Payload do Login trafegar `nome` e `telefone`. Se tudo for provido, o login simultaneamente o cadastra.

### 3.3 Integração Monetária
Módulos `vendas` se comunicam via uma abstraction/factory do Gateway `paymentGatewayFactory` para despachar pagamentos e Webhooks pro PIX (atualmente usando o modelo Gateway do Banco Inter).

### 3.4 CMS Pages
A equipe de marketing pode criar Landing Pages (ex: Fale-Conosco, Regulamento, Privacidade) usando a tabela Prisma `PaginaConteudo` pelos Endpoints CRUD do módulo `/admin/conteudo`. O frontend Cliente vai ler estas páginas chamando `GET /loja/paginas/:slug` (exposição livre de auth).

## 4. O Sistema de Compras Baseadas em "Chances"

> [!CAUTION]
> Durante essa iteração, mudamos a forma estrutural que preços eram definidos. A cartela não é mais baseada unicamente no custo base de edição `valorCartela × qtd`.

**A Modelagem:**
A tabela `EdicaoDetalhe` (responsável pelo gerenciamento em Range de bilhetes eletrônicos do sistema) recebeu a feature Column Nativa: `preco Decimal?`.

Com as novas demandas de marketing, o admin define Tiers de preços fixos isolados como promoções:
`2 Chances -> Custa $10,00`
`6 Chances -> Custa $20,00`
Na rota da Loja (*Client*), o sistema faz as verificações de checkout usando este modelo relacional antes de cobrar a fatura PIX.

---

**Isso é tudo!** O banco (Postgres/SQLite) está migrado perfeitamente de acordo com as mudanças e as tipologias compilam com Zero Erros semânticos do Nest (Exit Code 0). Boa codagem!
