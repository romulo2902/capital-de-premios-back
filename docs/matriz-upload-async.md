# Upload Assíncrono da Matriz de Ranges

## O que mudou

Antes, o `POST /admin/ranges/matriz/upload` ficava aberto até o arquivo inteiro ser processado — para arquivos de 1 milhão de linhas isso significava minutos com a requisição pendurada (timeout no browser/gateway).

Agora o endpoint retorna **imediatamente** e o processamento ocorre em background no servidor. Um segundo endpoint expõe o progresso.

---

## Endpoints

### `POST /admin/ranges/matriz/upload`

Inicia a importação. Retorna assim que o job é criado.

**Restrição:** se já há uma importação em andamento, devolve `409 Conflict` — o admin precisa aguardar.

**Resposta (202-like, status 200):**
```json
{
  "statusCode": 200,
  "message": "Importação iniciada. Consulte o status em GET /admin/ranges/matriz/upload/status.",
  "data": {
    "status": "em_andamento"
  }
}
```

**Resposta quando já existe importação ativa (409):**
```json
{
  "statusCode": 409,
  "message": "Já existe uma importação em andamento. Aguarde a conclusão antes de enviar um novo arquivo."
}
```

---

### `GET /admin/ranges/matriz/upload/status`

Sem parâmetros. Retorna o estado atual.

**Caso 1 — Importação em andamento (CSV, com porcentagem):**
```json
{
  "message": "Importação em andamento — 45%",
  "data": {
    "jobId": "a3f2c1d0-...",
    "status": "em_andamento",
    "importados": 225000,
    "total": 500000,
    "porcentagem": 45,
    "rangeInicio": "950000",
    "rangeFinal": "953721",
    "criadoEm": "2026-06-30T19:00:00.000Z",
    "concluidoEm": null
  }
}
```

**Caso 2 — Importação em andamento (XLSX — total desconhecido):**
```json
{
  "data": {
    "status": "em_andamento",
    "importados": 80000,
    "total": null,
    "porcentagem": null,
    "rangeInicio": "950000",
    "rangeFinal": "951234"
  }
}
```
> XLSX não expõe total de linhas sem parse completo. Mostrar spinner + contador crescente.

**Caso 3 — Concluída:**
```json
{
  "message": "Importação concluída — 1.000.000 registros",
  "data": {
    "status": "concluido",
    "importados": 1000000,
    "total": 1000000,
    "porcentagem": 100,
    "rangeInicio": "950000",
    "rangeFinal": "1949999",
    "criadoEm": "2026-06-30T19:00:00.000Z",
    "concluidoEm": "2026-06-30T19:03:42.000Z"
  }
}
```

**Caso 4 — Erro durante importação:**
```json
{
  "data": {
    "status": "erro",
    "importados": 45000,
    "erro": "Nenhuma linha válida encontrada no arquivo.",
    "rangeInicio": "950000",
    "rangeFinal": "950044"
  }
}
```

**Caso 5 — Sem importação na sessão, mas há dados no banco:**
```json
{
  "message": "Matriz carregada com 1.000.000 registros (range 950000 – 1949999)",
  "data": {
    "status": "sem_importacao_ativa",
    "registrosNaMatriz": 1000000,
    "rangeInicio": "950000",
    "rangeFinal": "1949999"
  }
}
```

**Caso 6 — Sem importação e banco vazio:**
```json
{
  "message": "Nenhuma importação realizada. A matriz está vazia.",
  "data": {
    "status": "sem_importacao_ativa",
    "registrosNaMatriz": 0,
    "rangeInicio": null,
    "rangeFinal": null
  }
}
```

---

## Sugestão de UI

### Tela de Gerenciamento de Matriz

A tela tem duas zonas: **estado atual da matriz** (sempre visível no topo) e **área de upload** (abaixo).

```
┌─────────────────────────────────────────────────────┐
│  MATRIZ DE RANGES                                   │
├─────────────────────────────────────────────────────┤
│  ● Matriz atual                                     │
│    1.000.000 registros                              │
│    Range: 950000 – 1949999                          │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  NOVA IMPORTAÇÃO                                    │
│                                                     │
│  [ Arraste o arquivo CSV ou XLSX aqui ]             │
│  ou  [ Selecionar arquivo ]                         │
│                                                     │
│  Limite: 250 MB · CSV recomendado para > 1M linhas  │
│                    [ Importar ]                     │
└─────────────────────────────────────────────────────┘
```

### Durante a importação (polling a cada 2s)

O botão "Importar" e a área de upload ficam **desabilitados** enquanto `status === "em_andamento"`.

**CSV** (total conhecido → barra de progresso):
```
┌─────────────────────────────────────────────────────┐
│  ⟳ Importando...                                    │
│                                                     │
│  ████████████░░░░░░░░░░░░░░░  45%                   │
│  225.000 / 500.000 registros                        │
│                                                     │
│  Range detectado: 950000 – 953721                   │
│  Iniciado às 19:00:00                               │
└─────────────────────────────────────────────────────┘
```

**XLSX** (total desconhecido → spinner + contador):
```
┌─────────────────────────────────────────────────────┐
│  ⟳ Importando...                                    │
│                                                     │
│  ◌  80.000 registros processados                    │
│                                                     │
│  Range detectado: 950000 – 951234                   │
│  Iniciado às 19:00:00                               │
└─────────────────────────────────────────────────────┘
```

### Concluída

```
┌─────────────────────────────────────────────────────┐
│  ✓ Importação concluída                             │
│                                                     │
│  1.000.000 registros                                │
│  Range: 950000 – 1949999                            │
│  Duração: 3min 42s                                  │
└─────────────────────────────────────────────────────┘
```

### Com erro

```
┌─────────────────────────────────────────────────────┐
│  ✗ Importação falhou                                │
│                                                     │
│  Nenhuma linha válida encontrada no arquivo.        │
│  45.000 registros foram processados antes da falha. │
│                                                     │
│             [ Tentar novamente ]                    │
└─────────────────────────────────────────────────────┘
```

---

## Lógica de polling sugerida

```typescript
// Após o POST de upload bem-sucedido:
const interval = setInterval(async () => {
  const { data } = await api.get('/admin/ranges/matriz/upload/status');

  setJobStatus(data);

  if (data.status === 'concluido' || data.status === 'erro') {
    clearInterval(interval);
    recarregarMatrizAtual(); // atualiza o card de estado atual
  }
}, 2000);
```

- Intervalo de **2 segundos** é suficiente — o servidor atualiza o job a cada lote de 5.000 registros.
- Ao receber `409` no POST, mostrar a mensagem de bloqueio e disparar o polling automaticamente para mostrar o progresso da importação já em andamento.
- Ao receber `status: "sem_importacao_ativa"` no GET inicial (carga da tela), exibir apenas o card de estado da matriz sem a barra de progresso.
