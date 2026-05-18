# Capital de Prêmios API — Architecture

## Visão Geral

API backend para plataforma de vendas de bilhetes de loteria/sorteio. Gerencia todo o ciclo: venda de bilhetes → pagamento → sorteio em tempo real → premiação → comissões.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | NestJS v11+ (TypeScript strict) |
| ORM | Prisma + PostgreSQL |
| Cache/Queue | Redis + BullMQ |
| Tempo Real | Socket.IO |
| Auth | Passport.js + JWT |
| Docs | Swagger/OpenAPI |
| Relatórios | ExcelJS + PDFKit |
| Storage | AWS S3 v3 |

## Módulos

```
modules/
  auth/          # Autenticação JWT (loja por CPF, painel por e-mail+senha)
  usuarios/      # CRUD de usuários do sistema
  clientes/      # Clientes (compradores de bilhetes)
  vendedores/    # Vendedores vinculados a distribuidores
  distribuidores/# Distribuidores regionais
  edicoes/       # Edições/sorteios (RASCUNHO → ATIVA → ENCERRADA → SORTEANDO → FINALIZADA)
  ranges/        # Ranges numéricos disponíveis para bilhetes
  vendas/        # Vendas e processamento de pagamento
  bilhetes/      # Bilhetes individuais vinculados a vendas
  pagamentos/    # Webhooks dos gateways PIX e Cartão
  sorteio/       # Apuração de sorteio + WebSocket gateway
  comissoes/     # Cálculo e gestão de comissões de vendedores
  saques/        # Solicitações e aprovação de saques
  relatorios/    # Exportação XLSX e PDF
  dashboard/     # Métricas e resumos para admin
  qrcode/        # Geração de QR Code por vendedor/distribuidor
  migracao/      # Utilitários de migração de dados legados
```

## Fluxo de Autenticação

```
Loja (cliente final):
  POST /auth/loja → { cpf } → JWT access token

Painel (admin/vendedor/distribuidor):
  POST /auth/login → { email, senha } → { accessToken, refreshToken }
  POST /auth/refresh → { refreshToken } → { accessToken }
  POST /auth/logout → invalida refresh token
```

## Hierarquia de Usuários

```
ADMIN
  └── DISTRIBUIDOR
        └── VENDEDOR
              └── CLIENTE
```

## Fluxo de Compra

```
1. Cliente escolhe bilhetes (quantidade)
2. POST /vendas → cria Venda (status: PENDENTE) + reserva Ranges
3. Gateway PIX/Cartão gera cobrança → retorna gatewayId
4. Gateway envia webhook de confirmação
5. POST /pagamentos/webhook/pix|cartao → valida assinatura
6. Sistema atualiza Venda para APROVADO
7. Bilhetes são liberados e vinculados
8. Comissão calculada automaticamente pelo % do vendedor
```

## Fluxo de Sorteio

```
1. Admin inicia apuração via API → Edicao status: SORTEANDO
2. Admin conecta ao WebSocket (room: edicao-{id})
3. Admin emite 'sorteio:marcar_numero' com o número apurado
4. Server processa, persiste e emite 'sorteio:numero_marcado' para a room
5. Sistema verifica automaticamente ganhadores
6. Se ganhador encontrado → emite 'sorteio:ganhador'
7. Ao finalizar → emite 'sorteio:resultado_final' → status: FINALIZADA
```

## Fluxo de Comissões

```
1. Venda aprovada → calcula valor = total * (comissaoPercent / 100)
2. Comissão criada com status PENDENTE
3. Vendedor solicita saque via POST /saques
4. Admin aprova → status APROVADO
5. Admin marca como pago → status PAGO
```

## Padrão de Resposta

```typescript
{
  statusCode: number;   // HTTP status code
  message: string;      // mensagem descritiva
  data: T | T[] | null; // payload
}
```

## Segurança

- `helmet` — headers de segurança HTTP
- `@nestjs/throttler` — rate limiting configurável (THROTTLE_TTL/THROTTLE_LIMIT)
- `compression` — compressão gzip
- CORS restrito a `FRONTEND_LOJA_URL`, `FRONTEND_ADMIN_URL` e origens extras em `FRONTEND_ALLOWED_ORIGINS`
- Swagger protegido por Basic Auth em produção
- JWT com access token curto (15m) + refresh token longo (7d)
