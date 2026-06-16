/**
 * Teste de carga — POS (somente leitura, sem compra)
 *
 * Fluxo por VU — Capital de Prêmios:
 *   1. Login por CPF                    → POST /api/pos/auth/login
 *   2. Listar edições ativas            → GET  /api/pos/edicoes
 *   3. Listar opções da edição          → GET  /api/pos/edicoes/{id}/opcoes
 *   4. Navegar combo 2 cartelas         → GET  /api/pos/edicoes/{id}/combos?quantidadeCartelas=2
 *   5. Navegar combo 3 cartelas         → GET  /api/pos/edicoes/{id}/combos?quantidadeCartelas=3
 *   6. Navegar combo 4 cartelas         → GET  /api/pos/edicoes/{id}/combos?quantidadeCartelas=4
 *   7. Avançar cursor (próximo)         → GET  /api/pos/edicoes/{id}/combos?...&direcao=PROXIMO
 *   8. Recuar cursor (anterior)         → GET  /api/pos/edicoes/{id}/combos?...&direcao=ANTERIOR
 *
 * Fluxo por VU — Capital Sena (leitura):
 *   9. Listar edições Sena ativas       → GET  /api/pos/capital-sena/edicoes
 *      (combos Sena vêm embutidos na resposta — não há endpoint separado de navegação)
 *
 * Uso:
 *   ~/bin/k6 run test/load/pos-leitura.js
 *
 * Parâmetros via env:
 *   BASE_URL   → URL base da API        (padrão: https://api2.capitaldepremios.com.br)
 *   CPF        → CPF do operador POS    (padrão: 31774704560)
 *   VUS        → virtual users         (padrão: 10)
 *   DURATION   → duração do teste      (padrão: 30s)
 *
 * Exemplos:
 *   ~/bin/k6 run test/load/pos-leitura.js
 *   ~/bin/k6 run -e VUS=50 -e DURATION=60s test/load/pos-leitura.js
 *   ~/bin/k6 run -e BASE_URL=http://localhost:3000 test/load/pos-leitura.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ─── Config ────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'https://api2.capitaldepremios.com.br';
const CPF_OPERADOR = __ENV.CPF || '31774704560';

export const options = {
  vus: Number(__ENV.VUS) || 10,
  duration: __ENV.DURATION || '30s',

  thresholds: {
    // 95% das requisições abaixo de 500ms
    http_req_duration: ['p(95)<500'],
    // Menos de 1% de erros
    http_req_failed: ['rate<0.01'],
    // Cada endpoint crítico com seu próprio threshold
    'combo_duration': ['p(95)<600'],
    'login_duration': ['p(95)<800'],
    'sena_duration':  ['p(95)<500'],
  },
};

// ─── Métricas customizadas ─────────────────────────────────────────────────

const loginOk = new Rate('login_ok');
const loginDuration = new Trend('login_duration', true);
const comboDuration = new Trend('combo_duration', true);
const senaDuration = new Trend('sena_duration', true);
const erros = new Counter('erros_total');

// ─── Setup: faz login UMA vez e compartilha o token ───────────────────────
// Evita que cada VU bata no endpoint de auth separadamente durante o teste.

export function setup() {
  const res = http.post(
    `${BASE_URL}/api/pos/auth/login`,
    JSON.stringify({ cpf: CPF_OPERADOR }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  const ok = check(res, {
    'setup: login 200': (r) => r.status === 200,
    'setup: token presente': (r) => {
      try { return !!JSON.parse(r.body).data.accessToken; } catch { return false; }
    },
  });

  if (!ok) {
    console.error(`Setup FALHOU — login retornou ${res.status}: ${res.body}`);
    return {};
  }

  const body = JSON.parse(res.body);
  const token = body.data.accessToken;
  const edicaoId = obterPrimeiraEdicaoId(token);

  console.log(`Setup OK → token emitido, edicaoId: ${edicaoId}`);
  return { token, edicaoId };
}

function obterPrimeiraEdicaoId(token) {
  const res = http.get(`${BASE_URL}/api/pos/edicoes`, {
    headers: authHeader(token),
  });

  if (res.status !== 200) {
    console.error(`Não conseguiu listar edições: ${res.status}`);
    return null;
  }

  const body = JSON.parse(res.body);
  const edicoes = body.data || [];
  return edicoes.length > 0 ? edicoes[0].id : null;
}

// ─── Cenário principal ─────────────────────────────────────────────────────

export default function (data) {
  const { token, edicaoId } = data;

  if (!token || !edicaoId) {
    erros.add(1);
    console.error('Setup incompleto — VU abortando iteração');
    return;
  }

  const headers = authHeader(token);

  // 1. Listar edições ativas
  {
    const res = http.get(`${BASE_URL}/api/pos/edicoes`, { headers });
    check(res, {
      'edicoes: status 200': (r) => r.status === 200,
      'edicoes: array não vazio': (r) => {
        try { return JSON.parse(r.body).data.length > 0; } catch { return false; }
      },
    }) || erros.add(1);
  }

  sleep(0.2);

  // 2. Listar opções da edição
  {
    const res = http.get(`${BASE_URL}/api/pos/edicoes/${edicaoId}/opcoes`, { headers });
    check(res, {
      'opcoes: status 200': (r) => r.status === 200,
      'opcoes: tem data': (r) => {
        try { return !!JSON.parse(r.body).data; } catch { return false; }
      },
    }) || erros.add(1);
  }

  sleep(0.2);

  // 3. Combos por quantidade (2, 3, 4 cartelas)
  for (const qtd of [2, 3, 4]) {
    const start = Date.now();
    const res = http.get(
      `${BASE_URL}/api/pos/edicoes/${edicaoId}/combos?quantidadeCartelas=${qtd}`,
      { headers },
    );
    comboDuration.add(Date.now() - start);

    const ok = check(res, {
      [`combo ${qtd}c: status 200`]: (r) => r.status === 200,
      [`combo ${qtd}c: tem comboAtual`]: (r) => {
        try { return JSON.parse(r.body).data.comboAtual !== null; } catch { return false; }
      },
      [`combo ${qtd}c: bilhetes corretos`]: (r) => {
        try {
          const bilhetes = JSON.parse(r.body).data.comboAtual?.bilhetes || [];
          return bilhetes.length === qtd;
        } catch { return false; }
      },
    });

    if (!ok) erros.add(1);

    // 4. Navegar para o próximo combo
    if (res.status === 200) {
      const cursor = obterCursor(res.body);
      if (cursor) {
        const navRes = http.get(
          `${BASE_URL}/api/pos/edicoes/${edicaoId}/combos?quantidadeCartelas=${qtd}&cursorNumeroBase=${cursor}&direcao=PROXIMO`,
          { headers },
        );
        check(navRes, {
          [`nav PROXIMO ${qtd}c: status 200`]: (r) => r.status === 200,
          [`nav PROXIMO ${qtd}c: cursor avançou`]: (r) => {
            try {
              const novo = JSON.parse(r.body).data.cursorNumeroBaseAtual;
              return novo !== null && novo !== cursor;
            } catch { return false; }
          },
        }) || erros.add(1);

        sleep(0.1);

        // 5. Voltar (anterior)
        const navResAnterior = http.get(
          `${BASE_URL}/api/pos/edicoes/${edicaoId}/combos?quantidadeCartelas=${qtd}&cursorNumeroBase=${cursor}&direcao=ANTERIOR`,
          { headers },
        );
        check(navResAnterior, {
          [`nav ANTERIOR ${qtd}c: status 200`]: (r) => r.status === 200,
        }) || erros.add(1);
      }
    }

    sleep(0.2);
  }

  // 6. Capital Sena — listar edições ativas (combos já vêm na resposta)
  {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/pos/capital-sena/edicoes`, { headers });
    senaDuration.add(Date.now() - start);

    check(res, {
      'sena edicoes: status 200': (r) => r.status === 200,
      'sena edicoes: é array': (r) => {
        try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; }
      },
      'sena edicoes: combos embutidos': (r) => {
        try {
          const edicoes = JSON.parse(r.body).data;
          if (edicoes.length === 0) return true; // sem edições ativas, ok
          return Array.isArray(edicoes[0].combos);
        } catch { return false; }
      },
    }) || erros.add(1);
  }

  sleep(0.2);

  // 8. Re-login (simula troca de operador no terminal — ~5% das iterações)
  if (Math.random() < 0.05) {
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/pos/auth/login`,
      JSON.stringify({ cpf: CPF_OPERADOR }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    loginDuration.add(Date.now() - start);
    const ok = check(res, {
      'relogin: status 200': (r) => r.status === 200,
    });
    loginOk.add(ok ? 1 : 0);
    if (!ok) erros.add(1);
  }

  sleep(0.5);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

function obterCursor(body) {
  try {
    return JSON.parse(body).data.cursorNumeroBaseAtual || null;
  } catch {
    return null;
  }
}
