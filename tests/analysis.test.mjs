import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrainExam, resolveAttempt, latestOutcomes, wrongKeys, domainTotals, weakestDomains, isTrainId } from '../assets/js/analysis.js';

// Dois simulados mínimos: D1-S1 (D2 e D3) e D1-S2 (D2)
const examsById = {
  'D1-S1': { id: 'D1-S1', questions: [
    { num: 1, domain: 2, n: 1, answer: [0] },
    { num: 2, domain: 2, n: 2, answer: [1, 3] },
    { num: 3, domain: 3, n: 1, answer: [2] },
  ] },
  'D1-S2': { id: 'D1-S2', questions: [
    { num: 1, domain: 2, n: 1, answer: [1] },
  ] },
};
const trainDefs = {};
const getTrainDef = (id) => trainDefs[id] ?? null;

test('isTrainId: aceita só ids gerados pelo treino', () => {
  assert.equal(isTrainId('TRAIN-abc123'), true);
  assert.equal(isTrainId('D1-S1'), false);
  assert.equal(isTrainId('TRAIN-D1+D2'), false); // formato antigo, com id fixo
  assert.equal(isTrainId(undefined), false);
});

test('buildTrainExam: renumera pela posição e guarda a origem', () => {
  const exam = buildTrainExam({ id: 'TRAIN-x1', title: 'D2', refs: [['D1-S2', 1], ['D1-S1', 2]] }, examsById);
  assert.deepEqual(exam.questions.map((q) => [q.num, q.sourceExamId, q.sourceNum]), [[1, 'D1-S2', 1], [2, 'D1-S1', 2]]);
  assert.equal(exam.set, 'D2');
  assert.equal(exam.total, 2);
});

test('buildTrainExam: referência inexistente é ignorada sem deslocar as demais', () => {
  const exam = buildTrainExam({ id: 'TRAIN-x2', title: 't', refs: [['D9-S9', 1], ['D1-S1', 1]] }, examsById);
  assert.equal(exam.questions.length, 1);
  assert.equal(exam.questions[0].num, 2); // continua sendo a posição 2 da lista, onde a resposta foi salva
});

test('resolveAttempt: tentativa de simulado e tentativa de treino', () => {
  trainDefs['TRAIN-t1'] = { id: 'TRAIN-t1', refs: [['D1-S2', 1], ['D1-S1', 3]] };
  const official = resolveAttempt({ examId: 'D1-S1', answers: { 1: [0] } }, examsById, getTrainDef);
  assert.equal(official.length, 3);
  assert.deepEqual(official[0].given, [0]);
  const train = resolveAttempt({ examId: 'TRAIN-t1', answers: { 1: [1], 2: [0] } }, examsById, getTrainDef);
  assert.deepEqual(train.map((r) => [r.key, r.given]), [['D1-S2#1', [1]], ['D1-S1#3', [0]]]);
});

test('resolveAttempt: treino sem definição devolve vazio (não quebra)', () => {
  assert.deepEqual(resolveAttempt({ examId: 'TRAIN-perdido', answers: {} }, examsById, getTrainDef), []);
});

test('latestOutcomes: errou e depois acertou, a questão deixa de ser "errada"', () => {
  const attempts = [
    { examId: 'D1-S1', finishedAt: 1000, answers: { 1: [3] } },  // errou D1-S1#1
    { examId: 'D1-S1', finishedAt: 2000, answers: { 1: [0] } },  // acertou depois
  ];
  const outcomes = latestOutcomes(attempts, examsById, getTrainDef);
  assert.equal(outcomes.get('D1-S1#1'), true);
  assert.deepEqual(wrongKeys(outcomes), []);
});

test('latestOutcomes: acertou e depois errou, volta para a lista de erradas', () => {
  const attempts = [
    { examId: 'D1-S1', finishedAt: 2000, answers: { 1: [2] } },
    { examId: 'D1-S1', finishedAt: 1000, answers: { 1: [0] } },
  ];
  assert.deepEqual(wrongKeys(latestOutcomes(attempts, examsById, getTrainDef)), ['D1-S1#1']);
});

test('latestOutcomes: questão sem resposta não conta como errada', () => {
  assert.equal(latestOutcomes([{ examId: 'D1-S1', finishedAt: 1, answers: {} }], examsById, getTrainDef).size, 0);
});

test('latestOutcomes: erro dentro de um treino entra na lista, acerto em treino tira', () => {
  trainDefs['TRAIN-t2'] = { id: 'TRAIN-t2', refs: [['D1-S1', 3], ['D1-S2', 1]] };
  const wrongInTrain = [{ examId: 'TRAIN-t2', finishedAt: 5, answers: { 1: [0], 2: [1] } }];
  assert.deepEqual(wrongKeys(latestOutcomes(wrongInTrain, examsById, getTrainDef)), ['D1-S1#3']);
  const fixedLater = [...wrongInTrain, { examId: 'TRAIN-t2', finishedAt: 9, answers: { 1: [2] } }];
  assert.deepEqual(wrongKeys(latestOutcomes(fixedLater, examsById, getTrainDef)), []);
});

test('domainTotals: soma simulados e treinos por domínio', () => {
  trainDefs['TRAIN-t3'] = { id: 'TRAIN-t3', refs: [['D1-S1', 3]] };
  const totals = domainTotals(
    [
      { examId: 'D1-S1', answers: { 1: [0], 2: [1, 3], 3: [0] } }, // D2: 2/2, D3: 0/1
      { examId: 'TRAIN-t3', answers: { 1: [2] } },               // D3: 1/1
    ],
    examsById,
    getTrainDef,
  );
  assert.deepEqual(totals[2], { correct: 2, total: 2 });
  assert.deepEqual(totals[3], { correct: 1, total: 2 });
});

// Regressão: a lista de pontos fracos mostrava domínios de peso baixo mesmo com 100% de acerto.
test('weakestDomains: domínio com 100% nunca é ponto fraco', () => {
  const rows = [
    { domain: '2', weight: 33.1, total: 17, avg: 0 },
    { domain: '3', weight: 3.1, total: 2, avg: 1 },
    { domain: '4', weight: 2.6, total: 1, avg: 1 },
  ];
  assert.deepEqual(weakestDomains(rows).map((r) => r.domain), ['2']);
});

test('weakestDomains: ordena por nota em jogo ((1 − acerto) × peso) e respeita o limite', () => {
  const rows = [
    { domain: '1', weight: 14.7, total: 8, avg: 0.5 },   // 7,35
    { domain: '2', weight: 33.1, total: 17, avg: 0.8 },  // 6,62
    { domain: '5', weight: 16.8, total: 9, avg: 0.2 },   // 13,44
    { domain: '8', weight: 10.6, total: 6, avg: 0.9 },   // 1,06
  ];
  const top = weakestDomains(rows, 2);
  assert.deepEqual(top.map((r) => r.domain), ['5', '1']);
  assert.ok(Math.abs(top[0].lost - 13.44) < 1e-9);
});

test('weakestDomains: ignora domínios sem questões respondidas', () => {
  assert.deepEqual(weakestDomains([{ domain: '6', weight: 11, total: 0, avg: 0 }]), []);
});
