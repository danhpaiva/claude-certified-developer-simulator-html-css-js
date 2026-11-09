import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCorrect, grade, lettersOf, LETTERS } from '../assets/js/scoring.js';

test('LETTERS contém A-E', () => {
  assert.equal(LETTERS, 'ABCDE');
});

test('isCorrect: resposta única correta', () => {
  const q = { answer: [2] };
  assert.equal(isCorrect(q, [2]), true);
});

test('isCorrect: resposta única errada', () => {
  const q = { answer: [2] };
  assert.equal(isCorrect(q, [1]), false);
});

test('isCorrect: sem resposta é incorreta', () => {
  const q = { answer: [2] };
  assert.equal(isCorrect(q, []), false);
});

test('isCorrect: múltipla resposta correta (ordem diferente)', () => {
  const q = { answer: [1, 3, 4] };
  assert.equal(isCorrect(q, [4, 1, 3]), true);
  assert.equal(isCorrect(q, [3, 4, 1]), true);
});

test('isCorrect: múltipla resposta incompleta', () => {
  const q = { answer: [1, 3, 4] };
  assert.equal(isCorrect(q, [1, 3]), false);
});

test('isCorrect: múltipla resposta com extras', () => {
  const q = { answer: [1, 3] };
  assert.equal(isCorrect(q, [1, 2, 3]), false);
});

test('grade: calcula acertos corretamente', () => {
  const exam = {
    questions: [
      { num: 1, domain: 1, skill: 'Test', answer: [0] },
      { num: 2, domain: 2, skill: 'Test', answer: [1] },
      { num: 3, domain: 1, skill: 'Test', answer: [2] },
    ],
  };
  
  const answers = {
    1: [0], // correta
    2: [0], // errada
    3: [],  // sem resposta
  };
  
  const result = grade(exam, answers);
  
  assert.equal(result.correct, 1);
  assert.equal(result.total, 3);
  assert.equal(result.answered, 2); // duas com resposta (mesmo a errada)
  assert.equal(result.percent, 1 / 3);
});

test('grade: agrupa por domínio', () => {
  const exam = {
    questions: [
      { num: 1, domain: 1, skill: 'Test', answer: [0] },
      { num: 2, domain: 1, skill: 'Test', answer: [1] },
      { num: 3, domain: 2, skill: 'Test', answer: [0] },
    ],
  };
  
  const answers = {
    1: [0], // D1 correta
    2: [0], // D1 errada
    3: [0], // D2 correta
  };
  
  const result = grade(exam, answers);
  
  assert.equal(result.byDomain[1].correct, 1);
  assert.equal(result.byDomain[1].total, 2);
  assert.equal(result.byDomain[2].correct, 1);
  assert.equal(result.byDomain[2].total, 1);
});

test('grade: items contém flags corretas', () => {
  const exam = {
    questions: [
      { num: 1, domain: 1, skill: 'Test', answer: [0] },
      { num: 2, domain: 1, skill: 'Test', answer: [1] },
    ],
  };
  
  const answers = {
    1: [0], // correta
    2: [],  // sem resposta
  };
  
  const result = grade(exam, answers);
  
  assert.equal(result.items[0].ok, true);
  assert.equal(result.items[0].unanswered, false);
  assert.equal(result.items[1].ok, false);
  assert.equal(result.items[1].unanswered, true);
});

test('lettersOf: converte índices em letras', () => {
  assert.equal(lettersOf([0]), 'A');
  assert.equal(lettersOf([1, 3]), 'B, D');
  assert.equal(lettersOf([0, 2, 4]), 'A, C, E');
});

test('lettersOf: ordena índices', () => {
  assert.equal(lettersOf([3, 0, 1]), 'A, B, D');
});
