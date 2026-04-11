# Handover: Refatoração da Matriz de Ranges e Alocação de Bilhetes

Este documento resume o estado atual da migração do sistema de ranges para uma matriz global estática e descreve o que ainda falta implementar.

## 1. O que já foi feito ✅

### Banco de Dados (Prisma)
- **Novo Modelo `MatrizRange`**: Substituiu o antigo `Range`. É uma tabela estática populada via CSV/XLSX com colunas `numero` (BigInt) e `sequenciaBolas` (Int[]).
- **Update no Modelo `Bilhete`**:
    - Removido `rangeId`.
    - Adicionado `matrizId` (FK para `MatrizRange`) e `edicaoId`.
    - Constraint de Unicidade: `@@unique([matrizId, edicaoId])`. Isso garante que o mesmo número da matriz não possa ser vendido duas vezes **dentro da mesma edição**, mas permite que edições diferentes compartilhem a mesma matriz.
- **Migration**: Criada e aplicada com sucesso.

### Backend (NestJS)
- **Módulo `ranges`**:
    - **Upload de Alta Performance**: Implementado endpoint `POST /admin/ranges/matriz/upload` que aceita CSV e XLSX.
    - **Streaming de Dados**: O parse de CSV usa `readline` e streaming real para suportar arquivos de 1 milhão+ de linhas sem estourar a memória (RAM).
    - **Suporte XLSX**: Adicionado via `xlsx` (SheetJS).
    - **Upsert em Lotes**: Inserção no banco via SQL Raw (`INSERT ... ON CONFLICT DO UPDATE`) em lotes de 5.000 para performance máxima.
- **Módulo `edicoes`**:
    - Removido BullMQ e toda a lógica de geração de ranges assíncrona.
    - O inventário (`obterInventarioRanges`) agora valida se a `MatrizRange` cobre o intervalo (`rangeInicio` a `rangeFinal`) da edição.
- **Módulo `vendas`**:
    - Atualizada lógica de `alocarBilhetes` para consumir a `MatrizRange`.
    - Cancelamento de venda apenas deleta os registros em `Bilhete`, liberando os números na matriz para aquela edição.

### Qualidade
- **Build**: `npm run build` executado com sucesso (zero erros de tipagem).
- **Testes**: Units tests básicos de `RangesService`, `EdicoesService` e `VendasService` atualizados.
- **Seeds**: Scripts de seed atualizados para a nova arquitetura.

---

## 2. O que falta implementar ⏳ (Pendências para a Próxima IA)

### A. Lógica de "Chances" (Padrão de Salto)
Atualmente, o método `alocarBilhetes` em `vendas.service.ts` apenas pega números sequenciais da matriz:
```typescript
const matrizDisponiveis = await tx.matrizRange.findMany({
  where: {
    numero: { gte: edicao.rangeInicio, lte: edicao.rangeFinal },
    bilhetes: { none: { edicaoId } }
  },
  orderBy: { numero: 'asc' },
  take: quantidade, // Erro: Se for 2 chances, deveria pegar quantidade * 2 com o padrão de salto
});
```
**Requisito do Usuário:**
Se uma edição/venda for de **10 chances**, o bilhete não deve ter números sequenciais (Ex: 1, 2, 3..). Ele deve seguir um padrão de salto (Ex: a cada 100.000).
*   **Ticket 1:** `0279880` (base), `0379880` (+100k), `0479880` (+200k), etc.
*   **Ticket 2:** `0279881` (base), `0379881` (+100k), `0479881` (+200k), etc.

**O que fazer:**
1. Determinar o `multiplicadorChances` (1, 2, 4, 6, 8, 10 ou 12) baseado no `Venda.tipoCartela`.
2. O total de números a alocar é `quantidadeVenda * multiplicadorChances`.
3. A lógica de busca deve encontrar um número `N` disponível no primeiro setor e automaticamente selecionar seus "parceiros" nos setores subsequentes da matriz (usando um salto fixo ou configurável, ex: 100.000).
4. Validar se todos os parceiros estão disponíveis para a edição antes de confirmar a alocação.

### B. UI/Frontend (Admin)
- Atualizar a tela de criação de edição para permitir escolher as chances (1, 2, 4, 6, 8, 10, 12).
- Adicionar componente de Upload de Arquivo para a Matriz Global no Dashboard de Ranges.

### C. Testes de Carga
- Validar a importação de um arquivo com exatamente 1.000.000+ de linhas para garantir que o streaming e os timeouts do servidor (Nginx/Node) estão configurados corretamente (sugestão: aumentar `body-parser` limit e timeout do server).

---

## 3. Informações Técnicas Relevantes
- **Tabela**: `MatrizRange`
- **Chave de Unicidade de Alocação**: `(matrizId, edicaoId)` na tabela `Bilhete`.
- **BigInt**: O campo `numero` é `BigInt`, use `.toString()` ao enviar via JSON para o frontend.
- **Localização dos arquivos principais**:
    - `src/modules/ranges/ranges.service.ts` (Lógica de importação/streaming)
    - `src/modules/vendas/vendas.service.ts` (Lógica de alocação de bilhetes - **PRECISA DE AJUSTE**)
    - `src/modules/edicoes/edicoes.service.ts` (Configuração e validação de edições)
