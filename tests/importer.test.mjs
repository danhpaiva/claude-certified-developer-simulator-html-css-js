import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAttempt, normalizeTrain, parseHistory, MAX_ATTEMPTS_PER_IMPORT } from '../assets/js/importer.js';

const valid = () => ({ id: 'D1-S1-1700000000000', examId: 'D1-S1', finishedAt: 1700000000000, mode: 'exam', lang: 'pt', durationMs: 5400000, answers: { 1: [0], 2: [1, 3] }, flags: [4], correct: 40, total: 53, percent: 0.75 });

test('normalizeAttempt: tentativa válida passa e o percentual é recalculado', () => {
  const a = normalizeAttempt({ ...valid(), percent: 0.99 }); // arquivo mente sobre o percentual
  assert.equal(a.percent, 40 / 53);
  assert.deepEqual(a.answers, { 1: [0], 2: [1, 3] });
});

test('normalizeAttempt: só guarda campos conhecidos (nada de lixo ou __proto__)', () => {
  const a = normalizeAttempt({ ...valid(), hack: '<img src=x onerror=alert(1)>', __proto__: { x: 1 }, extra: { deep: true } });
  assert.deepEqual(Object.keys(a).sort(), ['answers', 'correct', 'durationMs', 'examId', 'finishedAt', 'flags', 'id', 'lang', 'mode', 'percent', 'total']);
});

test('normalizeAttempt: rejeita o que não é objeto', () => {
  for (const bad of [null, undefined, 42, 'texto', [], true]) assert.equal(normalizeAttempt(bad), null);
});

test('normalizeAttempt: id inválido (tipo, tamanho, caracteres)', () => {
  for (const id of [undefined, 123, '', 'a b', '<script>', 'x'.repeat(121), '../../etc']) assert.equal(normalizeAttempt({ ...valid(), id }), null, String(id));
});

test('normalizeAttempt: examId só aceita simulado oficial ou treino', () => {
  assert.ok(normalizeAttempt({ ...valid(), examId: 'D12-S3' }));
  assert.ok(normalizeAttempt({ ...valid(), examId: 'TRAIN-mw9gw4w1cq6p' }));
  for (const examId of ['D1-S1/../x', 'train-x', 'TRAIN-', 'TRAIN-ABC', 'D1S1', 5, null]) assert.equal(normalizeAttempt({ ...valid(), examId }), null, String(examId));
});

test('normalizeAttempt: finishedAt, total e correct precisam ser números coerentes', () => {
  for (const patch of [{ finishedAt: '2026-11-09' }, { finishedAt: NaN }, { finishedAt: 0 }, { finishedAt: -5 }, { finishedAt: Infinity },
    { total: 0 }, { total: 501 }, { total: 53.5 }, { total: '53' }, { correct: 54 }, { correct: -1 }, { correct: 1.5 }, { correct: '40' }]) {
    assert.equal(normalizeAttempt({ ...valid(), ...patch }), null, JSON.stringify(patch));
  }
});

test('normalizeAttempt: mode, lang e durationMs caem em valores seguros', () => {
  const a = normalizeAttempt({ ...valid(), mode: 'hack', lang: 'fr', durationMs: 'muito' });
  assert.deepEqual([a.mode, a.lang, a.durationMs], ['exam', 'pt', 0]);
  assert.equal(normalizeAttempt({ ...valid(), durationMs: 9e15 }).durationMs, 24 * 3600 * 1000);
  assert.equal(normalizeAttempt({ ...valid(), durationMs: -10 }).durationMs, 0);
});

test('normalizeAttempt: answers é limpo (chaves numéricas, índices 0–4, sem repetição, ordenado)', () => {
  const a = normalizeAttempt({ ...valid(), answers: { 1: [3, 1, 1, 9, -1, 'x', 2.5], abc: [0], 2: 'nao-lista', 3: [], 1000: [0], 4: [4] } });
  assert.deepEqual(a.answers, { 1: [1, 3], 4: [4] });
});

test('normalizeAttempt: answers/flags ausentes ou de tipo errado viram vazios', () => {
  const a = normalizeAttempt({ ...valid(), answers: 'x', flags: { 1: 1 } });
  assert.deepEqual([a.answers, a.flags], [{}, []]);
  const b = normalizeAttempt({ id: 'ok', examId: 'D1-S1', finishedAt: 1000, correct: 40, total: 53 }); // formato mínimo antigo
  assert.deepEqual([b.answers, b.flags, b.mode], [{}, [], 'exam']);
});

test('normalizeAttempt: flags filtradas e sem repetição', () => {
  assert.deepEqual(normalizeAttempt({ ...valid(), flags: [5, 5, 'a', 0, 501, 7] }).flags, [5, 7]);
});

test('normalizeTrain: definição válida', () => {
  const t = normalizeTrain({ id: 'TRAIN-abc1', title: '  D2  ', refs: [['D1-S1', 3], ['D1-S2', 10]], createdAt: 5, extra: 1 });
  assert.deepEqual(t, { id: 'TRAIN-abc1', title: 'D2', refs: [['D1-S1', 3], ['D1-S2', 10]], createdAt: 5 });
});

test('normalizeTrain: rejeita id, título e referências inválidos (uma ref ruim invalida o treino todo)', () => {
  const base = { id: 'TRAIN-abc1', title: 'D2', refs: [['D1-S1', 1]] };
  for (const patch of [{ id: 'D1-S1' }, { id: 'TRAIN-' }, { title: '' }, { title: 5 }, { refs: [] }, { refs: 'x' }, { refs: [['D1-S1']] }, { refs: [['D1-S1', 0]] },
    { refs: [['TRAIN-x', 1]] }, { refs: [['D1-S1', 1.5]] }, { refs: Array.from({ length: 501 }, () => ['D1-S1', 1]) }, { refs: [['D1-S1', 1], null] }]) {
    assert.equal(normalizeTrain({ ...base, ...patch }), null, JSON.stringify(patch).slice(0, 60));
  }
});

test('normalizeTrain: título é cortado em 80 caracteres', () => {
  assert.equal(normalizeTrain({ id: 'TRAIN-a', title: 'x'.repeat(200), refs: [['D1-S1', 1]] }).title.length, 80);
});

test('parseHistory: aceita o formato antigo (lista) e o novo (objeto com attempts e trains)', () => {
  const legacy = parseHistory([valid()]);
  assert.deepEqual([legacy.ok, legacy.attempts.length, legacy.trains.length], [true, 1, 0]);
  const v2 = parseHistory({ version: 2, attempts: [valid()], trains: [{ id: 'TRAIN-abc1', title: 'x', refs: [['D1-S1', 1]] }] });
  assert.deepEqual([v2.ok, v2.attempts.length, v2.trains.length], [true, 1, 1]);
});

test('parseHistory: recusa o que não é histórico', () => {
  for (const payload of [null, 5, 'texto', {}, { attempts: 'x' }, { trains: [] }, true]) assert.equal(parseHistory(payload).ok, false, JSON.stringify(payload));
});

test('parseHistory: conta os itens inválidos', () => {
  const r = parseHistory([valid(), { id: 'sem-nada' }, null, 'x', valid()]);
  assert.deepEqual([r.attempts.length, r.invalid], [2, 3]);
});

test('parseHistory: limita o tamanho da importação', () => {
  const many = Array.from({ length: MAX_ATTEMPTS_PER_IMPORT + 25 }, (_, i) => ({ ...valid(), id: `id-${i}` }));
  const r = parseHistory(many);
  assert.equal(r.attempts.length, MAX_ATTEMPTS_PER_IMPORT);
  assert.equal(r.invalid, 25);
});
