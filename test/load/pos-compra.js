/**
 * Teste de carga — POS COM COMPRA REAL (Capital de Prêmios + Capital Sena)
 *
 * ⚠️  ATENÇÃO: este script cria vendas PENDENTE de verdade e gera cobrança
 *     PIX real no gateway (PagBank). As vendas não são pagas — ficam
 *     PENDENTE até expirar. Não rode em produção sem ciência disso.
 *
 * Cenários (escolhidos aleatoriamente por iteração, com pesos):
 *   35% → Prêmios: compra rápida (1 cartela, sem seleção)
 *   15% → Prêmios: combo 2 cartelas (navega + reserva + compra)
 *   15% → Prêmios: combo 3 cartelas (navega + reserva + compra)
 *   10% → Prêmios: combo 4 cartelas (navega + reserva + compra)
 *   13% → Sena: surpresinha
 *   12% → Sena: números manuais (6 dezenas aleatórias)
 *
 * Perfil de carga (RATE = compras/minuto, default 20):
 *   30s  warmup    → RATE * 0.5
 *   30s  ramp      → RATE
 *   3min sustain   → RATE
 *   1min stress    → RATE * 2
 *   30s  ramp down → 0
 *
 * Uso:
 *   ~/bin/k6 run test/load/pos-compra.js
 *   ~/bin/k6 run -e RATE=20 test/load/pos-compra.js
 *   ~/bin/k6 run -e RATE=50 test/load/pos-compra.js
 *   ~/bin/k6 run -e BASE_URL=http://localhost:3000 -e CPF_OPERADOR=12345678909 -e RATE=10 test/load/pos-compra.js
 */

import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ─── Config ────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'https://api2.capitaldepremios.com.br';
const CPF_OPERADOR = __ENV.CPF_OPERADOR || '31774704560';
const RATE = parseInt(__ENV.RATE || '20', 10);

const CLIENTE = {
  cpf: '06790319107',
  nome: 'Jair Rodrigues',
  telefone: '11999990000',
  email: 'jairsmr2019@gmail.com',
  dataNascimento: '2000-05-06',
};

export const options = {
  scenarios: {
    compras: {
      executor: 'ramping-arrival-rate',
      startRate: Math.max(1, Math.round(RATE * 0.3)),
      timeUnit: '1m',
      preAllocatedVUs: Math.max(3, Math.ceil(RATE * 0.4)),
      maxVUs: Math.max(10, RATE * 4),
      stages: [
        { duration: '30s', target: Math.max(1, Math.round(RATE * 0.5)) },
        { duration: '30s', target: RATE },
        { duration: '3m', target: RATE },
        { duration: '1m', target: RATE * 2 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    compra_ok: ['rate>0.90'],
    gateway_ms: ['p(95)<5000'],
    http_req_failed: ['rate<0.10'],
  },
};

// ─── Métricas customizadas ─────────────────────────────────────────────────

const compraOk = new Rate('compra_ok');
const gatewayMs = new Trend('gateway_ms', true);
const reservaConflito = new Counter('reserva_conflito');
const comprasPorTipo = new Counter('compras_por_tipo');

// ─── Setup: login + resolve edições uma única vez ─────────────────────────

export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/api/pos/auth/login`,
    JSON.stringify({ cpf: CPF_OPERADOR }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (loginRes.status !== 200) {
    console.error(`Setup: login falhou (${loginRes.status}): ${loginRes.body}`);
    return {};
  }

  const token = JSON.parse(loginRes.body).data.accessToken;
  const h = authHeaders(token);

  const edicoesRes = http.get(`${BASE_URL}/api/pos/edicoes`, { headers: h });
  const edicoes = edicoesRes.status === 200 ? JSON.parse(edicoesRes.body).data : [];
  const edicaoId = edicoes && edicoes.length > 0 ? edicoes[0].id : null;

  const senaRes = http.get(`${BASE_URL}/api/pos/capital-sena/edicoes`, { headers: h });
  const senaEdicoes = senaRes.status === 200 ? JSON.parse(senaRes.body).data : [];
  const edicaoSenaId = senaEdicoes && senaEdicoes.length > 0 ? senaEdicoes[0].id : null;

  console.log(
    `Setup OK | RATE=${RATE}/min | edicaoId=${edicaoId} | edicaoSenaId=${edicaoSenaId}`,
  );

  return { token, edicaoId, edicaoSenaId };
}

// ─── Cenário principal: escolhe um tipo de compra aleatoriamente ──────────

export default function (data) {
  const { token, edicaoId, edicaoSenaId } = data;

  if (!token || !edicaoId) {
    console.error('Setup incompleto — abortando iteração');
    return;
  }

  const rnd = Math.random();

  if (rnd < 0.35) {
    comprasPorTipo.add(1, { tipo: 'premios_rapida' });
    compraRapida(token, edicaoId);
  } else if (rnd < 0.5) {
    comprasPorTipo.add(1, { tipo: 'premios_combo2' });
    compraCombo(token, edicaoId, 2);
  } else if (rnd < 0.65) {
    comprasPorTipo.add(1, { tipo: 'premios_combo3' });
    compraCombo(token, edicaoId, 3);
  } else if (rnd < 0.75) {
    comprasPorTipo.add(1, { tipo: 'premios_combo4' });
    compraCombo(token, edicaoId, 4);
  } else if (rnd < 0.88 && edicaoSenaId) {
    comprasPorTipo.add(1, { tipo: 'sena_surpresinha' });
    compraSenaSurpresinha(token, edicaoSenaId);
  } else if (edicaoSenaId) {
    comprasPorTipo.add(1, { tipo: 'sena_manual' });
    compraSenaManual(token, edicaoSenaId);
  } else {
    // Sem edição Sena ativa: cai para compra rápida de Prêmios
    comprasPorTipo.add(1, { tipo: 'premios_rapida_fallback' });
    compraRapida(token, edicaoId);
  }
}

// ─── Capital de Prêmios ─────────────────────────────────────────────────────

function compraRapida(token, edicaoId) {
  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/pos/vendas`,
    JSON.stringify({ edicaoId, quantidadeCartelas: 1, ...CLIENTE }),
    { headers: authHeaders(token) },
  );
  gatewayMs.add(Date.now() - start);

  const ok = check(res, {
    'rapida: 201': (r) => r.status === 201,
    'rapida: tem pix': (r) => temPix(r),
  });
  compraOk.add(ok ? 1 : 0);
  if (!ok) logFalha('rapida', res);
}

function compraCombo(token, edicaoId, qtd) {
  const h = authHeaders(token);
  let bilhetes = null;
  let cursor = null;

  // Navega até achar um combo que consiga reservar (máx 5 tentativas — concorrência com outros VUs)
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const url =
      `${BASE_URL}/api/pos/edicoes/${edicaoId}/combos?quantidadeCartelas=${qtd}` +
      (cursor ? `&cursorNumeroBase=${cursor}&direcao=PROXIMO` : '');

    const comboRes = http.get(url, { headers: h });
    if (comboRes.status !== 200) break;

    const comboData = JSON.parse(comboRes.body).data;
    if (!comboData || !comboData.comboAtual) break;

    cursor = comboData.cursorNumeroBaseAtual;
    const numeros = comboData.comboAtual.bilhetes.map((b) => b.numero);

    const reservaRes = http.post(
      `${BASE_URL}/api/pos/edicoes/${edicaoId}/reservas`,
      JSON.stringify({ cartelas: numeros }),
      { headers: h },
    );

    if (reservaRes.status === 201) {
      bilhetes = numeros;
      break;
    }
    if (reservaRes.status === 409) {
      reservaConflito.add(1);
      continue; // outro VU pegou essa cartela — tenta a próxima
    }
    break; // erro inesperado (503 Redis, etc) — desiste
  }

  if (!bilhetes) {
    compraOk.add(0);
    return;
  }

  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/pos/vendas`,
    JSON.stringify({
      edicaoId,
      quantidadeCartelas: qtd,
      combosSelecionados: bilhetes,
      ...CLIENTE,
    }),
    { headers: h },
  );
  gatewayMs.add(Date.now() - start);

  const ok = check(res, {
    [`combo${qtd}c: 201`]: (r) => r.status === 201,
    [`combo${qtd}c: tem pix`]: (r) => temPix(r),
  });
  compraOk.add(ok ? 1 : 0);
  if (!ok) logFalha(`combo${qtd}c`, res);
}

// ─── Capital Sena ───────────────────────────────────────────────────────────

function compraSenaSurpresinha(token, edicaoSenaId) {
  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/pos/capital-sena/vendas`,
    JSON.stringify({
      edicaoSenaId,
      cartelas: [{ modoSelecao: 'SURPRESINHA' }],
      ...CLIENTE,
    }),
    { headers: authHeaders(token) },
  );
  gatewayMs.add(Date.now() - start);

  const ok = check(res, {
    'sena_surpresinha: 201': (r) => r.status === 201,
    'sena_surpresinha: tem pix': (r) => temPix(r),
  });
  compraOk.add(ok ? 1 : 0);
  if (!ok) logFalha('sena_surpresinha', res);
}

function compraSenaManual(token, edicaoSenaId) {
  const numeros = sortear6Dezenas();
  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/pos/capital-sena/vendas`,
    JSON.stringify({
      edicaoSenaId,
      cartelas: [{ modoSelecao: 'MANUAL', numeros }],
      ...CLIENTE,
    }),
    { headers: authHeaders(token) },
  );
  gatewayMs.add(Date.now() - start);

  const ok = check(res, {
    'sena_manual: 201': (r) => r.status === 201,
    'sena_manual: tem pix': (r) => temPix(r),
  });
  compraOk.add(ok ? 1 : 0);
  if (!ok) logFalha('sena_manual', res);
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function temPix(res) {
  try {
    return !!JSON.parse(res.body).data.pagamento?.pixCopiaECola;
  } catch {
    return false;
  }
}

function logFalha(tipo, res) {
  console.error(`${tipo} FALHOU (${res.status}): ${res.body.substring(0, 250)}`);
}

function sortear6Dezenas() {
  const pool = Array.from({ length: 60 }, (_, i) => i + 1);
  const resultado = [];
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(Math.random() * (pool.length - i)) + i;
    [pool[i], pool[idx]] = [pool[idx], pool[i]];
    resultado.push(pool[i]);
  }
  return resultado.sort((a, b) => a - b);
}
