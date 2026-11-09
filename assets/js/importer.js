// Validação e normalização do histórico importado (JSON vindo de um arquivo, portanto NÃO confiável).
// Módulo puro: sem DOM e sem armazenamento. Só o que é reconhecido e válido passa; o resto é descartado.
import { TRAIN_ID_PATTERN } from './analysis.js';

export const MAX_ATTEMPTS_PER_IMPORT = 500;
const MAX_QUESTIONS = 500;
const MAX_DURATION_MS = 24 * 3600 * 1000;

const ATTEMPT_ID = /^[A-Za-z0-9._+-]{1,120}$/;
const OFFICIAL_EXAM_ID = /^D\d{1,3}-S\d{1,3}$/;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const isExamId = (value) => typeof value === 'string' && (OFFICIAL_EXAM_ID.test(value) || TRAIN_ID_PATTERN.test(value));

// { "3": [0, 2] } -> só chaves numéricas e índices de alternativa 0–4, sem repetição, em ordem.
function cleanAnswers(raw) {
  const answers = {};
  if (!isObject(raw)) return answers;
  for (const [key, value] of Object.entries(raw)) {
    if (!/^\d{1,3}$/.test(key) || !Array.isArray(value)) continue;
    const picked = [...new Set(value.filter((v) => isInt(v, 0, 4)))].sort((a, b) => a - b);
    if (picked.length) answers[key] = picked;
  }
  return answers;
}

export function normalizeAttempt(raw) {
  if (!isObject(raw)) return null;
  if (typeof raw.id !== 'string' || !ATTEMPT_ID.test(raw.id)) return null;
  if (!isExamId(raw.examId)) return null;
  if (typeof raw.finishedAt !== 'number' || !Number.isFinite(raw.finishedAt) || raw.finishedAt <= 0) return null;
  if (!isInt(raw.total, 1, MAX_QUESTIONS) || !isInt(raw.correct, 0, raw.total)) return null;

  const duration = typeof raw.durationMs === 'number' && Number.isFinite(raw.durationMs) ? raw.durationMs : 0;
  return {
    id: raw.id,
    examId: raw.examId,
    finishedAt: raw.finishedAt,
    mode: raw.mode === 'study' ? 'study' : 'exam',
    lang: raw.lang === 'en' ? 'en' : 'pt',
    durationMs: Math.min(Math.max(duration, 0), MAX_DURATION_MS),
    answers: cleanAnswers(raw.answers),
    flags: Array.isArray(raw.flags) ? [...new Set(raw.flags.filter((n) => isInt(n, 1, MAX_QUESTIONS)))].slice(0, MAX_QUESTIONS) : [],
    correct: raw.correct,
    total: raw.total,
    percent: raw.correct / raw.total, // nunca confiar no percentual do arquivo: é recalculado
  };
}

export function normalizeTrain(raw) {
  if (!isObject(raw)) return null;
  if (typeof raw.id !== 'string' || !TRAIN_ID_PATTERN.test(raw.id)) return null;
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 80) : '';
  if (!title) return null;
  if (!Array.isArray(raw.refs) || raw.refs.length < 1 || raw.refs.length > MAX_QUESTIONS) return null;
  const refs = [];
  for (const ref of raw.refs) {
    if (!Array.isArray(ref) || ref.length !== 2) return null;
    const [examId, num] = ref;
    if (typeof examId !== 'string' || !OFFICIAL_EXAM_ID.test(examId) || !isInt(num, 1, MAX_QUESTIONS)) return null;
    refs.push([examId, num]);
  }
  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
  return { id: raw.id, title, refs, createdAt };
}

// Aceita o formato antigo (lista de tentativas) e o atual ({ version, attempts, trains }).
export function parseHistory(payload) {
  const list = Array.isArray(payload) ? payload : isObject(payload) && Array.isArray(payload.attempts) ? payload.attempts : null;
  if (!list) return { ok: false, attempts: [], trains: [], invalid: 0 };

  const attempts = [];
  let invalid = Math.max(0, list.length - MAX_ATTEMPTS_PER_IMPORT);
  for (const raw of list.slice(0, MAX_ATTEMPTS_PER_IMPORT)) {
    const attempt = normalizeAttempt(raw);
    if (attempt) attempts.push(attempt);
    else invalid += 1;
  }
  const rawTrains = isObject(payload) && Array.isArray(payload.trains) ? payload.trains.slice(0, MAX_ATTEMPTS_PER_IMPORT) : [];
  const trains = rawTrains.map(normalizeTrain).filter(Boolean);
  return { ok: true, attempts, trains, invalid };
}
