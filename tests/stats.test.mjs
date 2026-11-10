import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domainTotals, domainRows, overallStats, weakestDomains } from '../assets/js/analysis.js';

const DOMAINS = { 1: { name: 'Um', weight: 40 }, 2: { name: 'Dois', weight: 60 } };
const q = (num, domain, answer = [0]) => ({ num, domain, answer, n: answer.length });
const exam = (id, questions) => ({ id, questions });
const attempt = (id, examId, answers, finishedAt = 1, percent = 0.5) => ({ id, examId, answers, finishedAt, percent });
const noTrain = () => null;

// ---------- domainTotals + domainRows ----------
test('sem tentativas: nenhum total, nenhuma linha, nenhum ponto fraco', () => {
  const totals = domainTotals([], {}, noTrain);
  assert.deepEqual(totals, {});
  const rows = domainRows(DOMAINS, totals);
  assert.deepEqual(rows, []);
  assert.deepEqual(weakestDomains(rows), []);
});

test('tentativa de um simulado que não existe mais é ignorada (sem erro, sem linhas)', () => {
  const totals = domainTotals([attempt('a', 'DIA9-SIM9', { 1: [0] })], {}, noTrain);
  assert.deepEqual(totals, {});
  assert.deepEqual(domainRows(DOMAINS, totals), []);
});

test('tentativa inexistente + tentativa válida: só a válida conta', () => {
  const exams = { 'DIA1-SIM1': exam('DIA1-SIM1', [q(1, 1), q(2, 2)]) };
  const totals = domainTotals([attempt('a', 'DIA9-SIM9', {}), attempt('b', 'DIA1-SIM1', { 1: [0], 2: [1] })], exams, noTrain);
  assert.deepEqual(totals, { 1: { correct: 1, total: 1 }, 2: { correct: 0, total: 1 } });
});

test('só treinos: contam por domínio das questões de origem; treino apagado é ignorado', () => {
  const exams = { 'DIA1-SIM1': exam('DIA1-SIM1', [q(1, 1), q(2, 2), q(3, 2)]) };
  const defs = { 'TRAIN-a': { id: 'TRAIN-a', refs: [['DIA1-SIM1', 3], ['DIA1-SIM1', 1]] } };
  const attempts = [attempt('t1', 'TRAIN-a', { 1: [0], 2: [4] }), attempt('t2', 'TRAIN-sumiu', { 1: [0] })];
  const totals = domainTotals(attempts, exams, (id) => defs[id] ?? null);
  assert.deepEqual(totals, { 2: { correct: 1, total: 1 }, 1: { correct: 0, total: 1 } });
});

test('simulado + treino somam no mesmo domínio', () => {
  const exams = { 'DIA1-SIM1': exam('DIA1-SIM1', [q(1, 1), q(2, 1)]) };
  const defs = { 'TRAIN-a': { id: 'TRAIN-a', refs: [['DIA1-SIM1', 2]] } };
  const totals = domainTotals([attempt('a', 'DIA1-SIM1', { 1: [0], 2: [0] }), attempt('t', 'TRAIN-a', { 1: [0] })], exams, (id) => defs[id] ?? null);
  assert.deepEqual(totals[1], { correct: 3, total: 3 });
});

test('questão em branco conta como erro no total do domínio', () => {
  const exams = { E: exam('E', [q(1, 1), q(2, 1)]) };
  const totals = domainTotals([attempt('a', 'E', { 1: [0] })], exams, noTrain);
  assert.deepEqual(totals[1], { correct: 1, total: 2 });
});

test('domainRows: percentual com total zero vira 0 (nunca NaN) e a linha é omitida', () => {
  const rows = domainRows(DOMAINS, { 1: { correct: 0, total: 0 }, 2: { correct: 3, total: 4 } });
  assert.deepEqual(rows.map((r) => r.domain), ['2']);
  assert.equal(rows[0].avg, 0.75);
  assert.ok(rows.every((r) => Number.isFinite(r.avg)));
});

test('domainRows: mantém a ordem do manifesto e traz nome e peso; domínio fora do manifesto é ignorado', () => {
  const rows = domainRows(DOMAINS, { 2: { correct: 1, total: 2 }, 1: { correct: 2, total: 2 }, 7: { correct: 1, total: 1 } });
  assert.deepEqual(rows, [
    { domain: '1', name: 'Um', weight: 40, correct: 2, total: 2, avg: 1 },
    { domain: '2', name: 'Dois', weight: 60, correct: 1, total: 2, avg: 0.5 },
  ]);
});

test('domainRows: manifesto sem domínios (ou indefinido) => vazio', () => {
  assert.deepEqual(domainRows({}, { 1: { correct: 1, total: 1 } }), []);
  assert.deepEqual(domainRows(undefined, {}), []);
});

test('weakestDomains: domínio perfeito nunca entra; ordena por nota perdida (peso × erro); respeita o limite', () => {
  const rows = domainRows({ ...DOMAINS, 3: { name: 'Três', weight: 10 } }, { 1: { correct: 2, total: 4 }, 2: { correct: 4, total: 4 }, 3: { correct: 0, total: 2 } });
  const weak = weakestDomains(rows, 3);
  assert.deepEqual(weak.map((d) => d.domain), ['1', '3']); // 1: 0.5×40=20; 3: 1×10=10; 2 perfeito fora
  assert.equal(weak[0].lost, 20);
  assert.equal(weakestDomains(rows, 1).length, 1);
});

// ---------- overallStats ----------
test('overallStats: sem tentativas => tudo zero (Math.max de lista vazia daria -Infinity)', () => {
  assert.deepEqual(overallStats([]), { count: 0, avg: 0, best: 0 });
});

test('overallStats: média, melhor e contagem', () => {
  assert.deepEqual(overallStats([{ percent: 0.5 }, { percent: 0.9 }, { percent: 0.1 }]), { count: 3, avg: 0.5, best: 0.9 });
});

test('overallStats: percentual inválido (NaN/undefined) não contamina a média', () => {
  const stats = overallStats([{ percent: 0.8 }, { percent: NaN }, {}]);
  assert.equal(stats.count, 3);
  assert.equal(stats.avg, 0.8);
  assert.equal(stats.best, 0.8);
});

test('overallStats: todos 0% => média e melhor 0', () => {
  assert.deepEqual(overallStats([{ percent: 0 }, { percent: 0 }]), { count: 2, avg: 0, best: 0 });
});
