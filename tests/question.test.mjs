import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.DocumentFragment = dom.window.DocumentFragment;

const { setLang } = await import('../assets/js/i18n.js');
const { translationBlock } = await import('../assets/js/question.js');

const q = {
  num: 1, n: 1, answer: [1],
  pt: { stem: 'Qual é a melhor abordagem?', options: ['Alfa', 'Beta', 'Gama', 'Delta'], explanation: 'Correta («B»): porque sim.' },
  en: { stem: 'Which approach is best?', options: ['Alpha', 'Beta', 'Gamma', 'Delta'], explanation: 'Correct: because.' },
};
beforeEach(() => setLang('en'));

test('translationBlock: na prova em português não aparece (null)', () => {
  setLang('pt');
  assert.equal(translationBlock(q), null);
});

test('translationBlock: em inglês, botão "Ver tradução em português" fechado por padrão', () => {
  const el = translationBlock(q);
  assert.equal(el.tagName, 'DETAILS');
  assert.equal(el.open, false);
  assert.equal(el.querySelector('summary').textContent, 'Ver tradução em português');
});

test('translationBlock: mostra enunciado e alternativas em português, com as letras', () => {
  const el = translationBlock(q);
  assert.match(el.textContent, /Qual é a melhor abordagem\?/);
  const items = [...el.querySelectorAll('.tr-options li')];
  assert.deepEqual(items.map((li) => li.textContent), ['AAlfa', 'BBeta', 'CGama', 'DDelta']);
  assert.equal(el.querySelector('.translation-body').getAttribute('lang'), 'pt-BR');
});

test('translationBlock: antes de revelar NÃO vaza a explicação nem a alternativa correta', () => {
  const el = translationBlock(q, { reveal: false });
  assert.equal(el.querySelector('.tr-explanation'), null);
  assert.equal(el.querySelector('li.is-correct'), null);
  assert.ok(!el.textContent.includes('porque sim'));
});

test('translationBlock: ao revelar, marca a correta e inclui a explicação em português', () => {
  const el = translationBlock(q, { reveal: true });
  assert.deepEqual([...el.querySelectorAll('li.is-correct')].map((li) => li.textContent), ['BBeta']);
  assert.match(el.querySelector('.tr-explanation').textContent, /porque sim/);
});

test('translationBlock: open inicial e callback ao abrir/fechar (para sobreviver ao redesenho)', () => {
  const calls = [];
  const el = translationBlock(q, { open: true, onToggle: (v) => calls.push(v) });
  assert.equal(el.open, true);
  el.open = false;
  el.dispatchEvent(new dom.window.Event('toggle'));
  el.open = true;
  el.dispatchEvent(new dom.window.Event('toggle'));
  assert.deepEqual(calls, [false, true]);
});

test('translationBlock: questão sem versão em português (treino/dados antigos) => null, sem erro', () => {
  assert.equal(translationBlock({ ...q, pt: undefined }), null);
});
