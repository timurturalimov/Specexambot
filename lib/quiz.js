import { QUESTIONS } from '../data/questions.js';
import { shuffle } from './rng.js';

export const MODES = {
  e: { name: 'Экзамен', count: 40 }, // как в ЦОНе: 40 вопросов
  p: { name: 'Тренировка', count: 10 },
};

// Дата по Алматы (UTC+5) в формате YYYY-MM-DD — для вопросов с from/until.
export function today(now = new Date()) {
  return new Date(now.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

export function activeQuestions(now = new Date(), opts = {}) {
  const allowUnverified = opts.allowUnverified ?? process.env.SERVE_UNVERIFIED !== 'false';
  const d = today(now);
  return QUESTIONS.filter(
    (q) => (!q.from || q.from <= d) && (!q.until || d <= q.until) && (allowUnverified || q.verified),
  );
}

// Набор вопросов теста однозначно определяется seed + режимом + датой.
export function pickQuestions(seed, mode, now, opts) {
  const pool = activeQuestions(now, opts).sort((a, b) => (a.id < b.id ? -1 : 1));
  const n = Math.min(MODES[mode].count, pool.length);
  return shuffle(pool, seed).slice(0, n);
}

// Порядок вариантов ответа: индексы options в перемешанном виде.
export function optionOrder(seed, i, q) {
  return shuffle(q.options.map((_, k) => k), seed * 131 + i + 1);
}

// ---- Состояние теста в callback_data ----
// mask — число, в котором i-й бит = 1, если на i-й вопрос ответили неверно.

export const bit = (mask, i) => Math.floor(mask / 2 ** i) % 2;
export const setBit = (mask, i) => (bit(mask, i) ? mask : mask + 2 ** i);
export function wrongIndexes(mask, n) {
  const out = [];
  for (let i = 0; i < n; i++) if (bit(mask, i)) out.push(i);
  return out;
}

export const cb = {
  start: (m) => `s:${m}`,
  answer: (m, seed, i, mask, choice) => `a:${m}:${seed.toString(36)}:${i}:${mask.toString(36)}:${choice}`,
  next: (m, seed, i, mask) => `n:${m}:${seed.toString(36)}:${i}:${mask.toString(36)}`,
};

export function parseCb(data) {
  const p = String(data).split(':');
  const kind = p[0];
  if (kind === 's' && MODES[p[1]]) return { kind, mode: p[1] };
  if ((kind === 'a' && p.length === 6) || (kind === 'n' && p.length === 5)) {
    if (!MODES[p[1]]) return null;
    const r = {
      kind,
      mode: p[1],
      seed: parseInt(p[2], 36),
      i: Number(p[3]),
      mask: parseInt(p[4], 36),
    };
    if (kind === 'a') r.choice = Number(p[5]);
    if ([r.seed, r.i, r.mask].some((x) => !Number.isFinite(x))) return null;
    return r;
  }
  return null;
}
