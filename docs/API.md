# Capital de Prêmios API — Guia de Rotas e Testes no Swagger

> **Guia completo do POS (terminal físico):** [docs/POS_TESTE.md](POS_TESTE.md)

> **Swagger disponível em:** `http://localhost:3000/api/docs` (apenas em desenvolvimento)

---

## 🔐 Credenciais de Teste (Seed)

| Perfil | E-mail | Senha | CPF | Endpoint |
|--------|--------|-------|-----|----------|
| **ADMIN** | `admin@capitalpremios.com` | `Admin@123` | — | `POST /api/auth/login` |
| **DISTRIBUIDOR** | `distribuidor@capitalpremios.com` | `Dist@123` | — | `POST /api/auth/loja` |
| **VENDEDOR 1** | `vendedor1@capitalpremios.com` | `Vend@123` | — | `POST /api/auth/loja` |
| **VENDEDOR 2** | `vendedor2@capitalpremios.com` | `Vend@123` | — | `POST /api/auth/loja` |
| **CLIENTE** | — | — | `000.000.000-00` | `POST /api/auth/loja` |

---

## 📋 Como testar no Swagger

### 1. Faça login e copie o `accessToken`

**ADMIN → `POST /api/auth/login`**
```json
{ "email": "admin@capitalpremios.com", "senha": "Admin@123" }
```

**DISTRIBUIDOR ou VENDEDOR → `POST /api/auth/loja`**
```json
{ "email": "distribuidor@capitalpremios.com", "senha": "Dist@123" }
```

**CLIENTE → `POST /api/auth/loja`**
```json
{ "cpf": "000.000.000-00" }
```

### 2. Autorize no Swagger
Clique em **Authorize** (cadeado 🔒 no topo da página) e cole o `accessToken`.

---

## 🖥️ Painel Admin — `/api/admin/*`

> **Acesso:** `ADMIN` apenas  
> **Login:** `POST /api/auth/login`

### Auth
| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/auth/login` | Login do admin (ADMIN) |
| `POST` | `/api/auth/refresh` | Renovar token |

### Distribuidores
| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/admin/distribuidores` | Listar todos |
| `POST` | `/api/admin/distribuidores` | Criar distribuidor |
| `GET` | `/api/admin/distribuidores/:id` | Buscar por ID |
| `GET` | `/api/admin/distribuidores/codigo/:codigo` | Buscar por código |
| `PATCH` | `/api/admin/distribuidores/:id` | Atualizar |
| `DELETE` | `/api/admin/distribuidores/:id` | Inativar |

### Vendedores
| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/admin/vendedores` | Listar todos |
| `POST` | `/api/admin/vendedores` | Criar vendedor |
| `GET` | `/api/admin/vendedores/:id` | Buscar por ID |
| `GET` | `/api/admin/vendedores/codigo/:codigo` | Buscar por código |
| `PATCH` | `/api/admin/vendedores/:id` | Atualizar |
| `DELETE` | `/api/admin/vendedores/:id` | Inativar |

### Edições
| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/admin/edicoes` | Listar edições |
| `GET` | `/api/admin/edicoes/:id` | Buscar edição por ID |

### Sorteio
| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/admin/sorteio` | Listar sorteios ativos |
| `GET` | `/api/admin/sorteio/:id` | Buscar sorteio por edição |
| `POST` | `/api/admin/sorteio/:edicaoId/iniciar` | Iniciar apuração |

### Relatórios
| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/admin/relatorios` | Listar endpoints disponíveis |
| `GET` | `/api/admin/relatorios/vendas/xlsx` | Exportar vendas (XLSX) |
| `GET` | `/api/admin/relatorios/comissoes/pdf` | Exportar comissões (PDF) |

### QR Code
| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/admin/qrcode/vendedor/:id` | QR Code do vendedor (PNG) |
| `GET` | `/api/admin/qrcode/distribuidor/:id` | QR Code do distribuidor (PNG) |

### Usuários
| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/admin/usuarios` | Listar usuários do sistema |
| `GET` | `/api/admin/usuarios/:id` | Buscar usuário por ID |

### Migração
| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/admin/migracao` | Listar migrações |
| `GET` | `/api/admin/migracao/:id` | Buscar migração por ID |

---

## 🏪 Loja — Distribuidor — `/api/distribuidor/*`

> **Acesso:** `DISTRIBUIDOR` apenas (dados isolados — só vê os próprios)  
> **Login:** `POST /api/auth/loja` com `{ "email": "...", "senha": "..." }`

| Método | Rota | RF | Descrição |
|--------|------|----|-----------|
| `GET` | `/api/distribuidor/perfil` | — | Ver próprio perfil |
| `GET` | `/api/distribuidor/vendedores` | RF-D03 | Listar vendedores vinculados |
| `POST` | `/api/distribuidor/vendedores` | RF-D03 | Cadastrar vendedor vinculado |
| `GET` | `/api/distribuidor/vendas` | RF-D02 | Vendas próprias + dos vendedores |
| `GET` | `/api/distribuidor/vendas?status=APROVADO` | RF-D04 | Filtrar por etapa/status |
| `GET` | `/api/distribuidor/relatorios/performance` | RF-D05 | Ranking por etapa por vendedor |
| `GET` | `/api/distribuidor/saques` | — | Histórico de saques |
| `POST` | `/api/distribuidor/saques` | — | Solicitar saque |

**Body para criar vendedor:**
```json
{
  "nome": "João Vendedor",
  "cpf": "111.111.111-11",
  "email": "joao@email.com",
  "telefone": "11999990000",
  "comissaoPercent": 10,
  "senha": "Senha@123"
}
```

**Body para solicitar saque:**
```json
{ "valor": 150.00 }
```

---

## 🏪 Loja — Vendedor — `/api/vendedor/*`

> **Acesso:** `VENDEDOR` apenas (dados isolados — só vê os próprios)  
> **Login:** `POST /api/auth/loja` com `{ "email": "...", "senha": "..." }`

| Método | Rota | RF | Descrição |
|--------|------|----|-----------|
| `GET` | `/api/vendedor/perfil` | — | Ver próprio perfil |
| `GET` | `/api/vendedor/vendas` | RF-V02 | Ver apenas próprias vendas |
| `GET` | `/api/vendedor/vendas?status=APROVADO` | RF-V02 | Filtrar vendas por status |
| `GET` | `/api/vendedor/comissoes` | RF-V03 | Comissões + total acumulado pago |
| `GET` | `/api/vendedor/comissoes?status=PENDENTE` | RF-V03 | Filtrar comissões por status |
| `GET` | `/api/vendedor/saques` | RF-V05 | Histórico de saques |
| `POST` | `/api/vendedor/saques` | RF-V04 | Solicitar saque |

**Body para solicitar saque:**
```json
{ "valor": 100.00 }
```

---

## 🛒 Loja — Público / Cliente — `/api/*`

> **Acesso:** Público ou `CLIENTE`  
> **Login:** `POST /api/auth/loja` com `{ "cpf": "000.000.000-00" }`

### Auth
| Método | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| `POST` | `/api/auth/loja` | Público | Login (DISTRIBUIDOR/VENDEDOR/CLIENTE) |
| `POST` | `/api/auth/refresh` | Autenticado | Renovar access token |

### Clientes
| Método | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| `POST` | `/api/clientes` | ADMIN/DISTRIBUIDOR/VENDEDOR | Criar cliente |
| `GET` | `/api/clientes` | ADMIN/DISTRIBUIDOR/VENDEDOR | Listar clientes |
| `GET` | `/api/clientes/:id` | ADMIN/DISTRIBUIDOR/VENDEDOR | Buscar por ID |
| `GET` | `/api/clientes/cpf/:cpf` | ADMIN/DISTRIBUIDOR/VENDEDOR | Buscar por CPF |
| `PATCH` | `/api/clientes/:id` | ADMIN/DISTRIBUIDOR/VENDEDOR | Atualizar dados |
| `DELETE` | `/api/clientes/:id` | ADMIN | Inativar cliente |

### Vendas
| Método | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| `GET` | `/api/vendas` | Autenticado | Listar vendas |
| `GET` | `/api/vendas/:id` | Autenticado | Buscar venda |

### Bilhetes
| Método | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| `GET` | `/api/bilhetes` | Autenticado | Listar bilhetes |
| `GET` | `/api/bilhetes/:id` | Autenticado | Buscar bilhete |

### Pagamentos
| Método | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| `GET` | `/api/pagamentos` | Autenticado | Listar pagamentos |
| `GET` | `/api/pagamentos/:id` | Autenticado | Buscar pagamento |

### Comissões
| Método | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| `GET` | `/api/comissoes` | Autenticado | Listar comissões |
| `GET` | `/api/comissoes/:id` | Autenticado | Buscar comissão |

### Ranges
| Método | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| `GET` | `/api/ranges` | Autenticado | Listar ranges disponíveis |
| `GET` | `/api/ranges/:id` | Autenticado | Buscar range |

### Dashboard
| Método | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| `GET` | `/api/dashboard` | Autenticado | Dados do dashboard |

---

## 📊 Status de Enums

### StatusVenda / Etapas
| Valor | Descrição |
|-------|-----------|
| `PENDENTE` | Aguardando pagamento |
| `APROVADO` | Pago e confirmado |
| `RECUSADO` | Pagamento recusado |
| `CANCELADO` | Cancelado |

### StatusSaque
| Valor | Descrição |
|-------|-----------|
| `SOLICITADO` | Aguardando análise |
| `APROVADO` | Aprovado, aguardando pagamento |
| `PAGO` | Pago |
| `RECUSADO` | Recusado |

### StatusComissao
| Valor | Descrição |
|-------|-----------|
| `PENDENTE` | Comissão gerada, não paga |
| `PAGO` | Comissão paga |

### StatusEdicao
| Valor | Descrição |
|-------|-----------|
| `RASCUNHO` | Em configuração |
| `ATIVA` | Disponível para venda |
| `ENCERRADA` | Vendas encerradas |
| `SORTEANDO` | Apuração em andamento |
| `FINALIZADA` | Sorteio concluído |
