import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mock do localStorage
const mockStorage = {};
global.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, value) => { mockStorage[key] = value; },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: () => { for (const key in mockStorage) delete mockStorage[key]; },
};

// Importa após definir o mock
import { store } from '../assets/js/store.js';

test('store.getPref: retorna fallback se não existir', () => {
  localStorage.clear();
  assert.equal(store.getPref('theme', 'light'), 'light');
});

test('store.setPref e getPref: salva e recupera preferência', () => {
  localStorage.clear();
  store.setPref('lang', 'pt');
  assert.equal(store.getPref('lang', 'en'), 'pt');
});

test('store.session: retorna null se não existir', () => {
  localStorage.clear();
  assert.equal(store.session('DIA1-SIM1'), null);
});

test('store.saveSession e session: salva e recupera sessão', () => {
  localStorage.clear();
  const session = {
    mode: 'exam',
    startedAt: Date.now(),
    deadline: Date.now() + 7200000,
    answers: { 1: [0], 2: [1, 3] },
    flags: [5],
    checked: [],
    current: 1,
  };
  
  store.saveSession('DIA1-SIM1', session);
  const recovered = store.session('DIA1-SIM1');
  
  assert.deepEqual(recovered, session);
});

test('store.clearSession: remove sessão', () => {
  localStorage.clear();
  store.saveSession('DIA1-SIM1', { mode: 'exam' });
  store.clearSession('DIA1-SIM1');
  assert.equal(store.session('DIA1-SIM1'), null);
});

test('store.attempts: retorna array vazio se não houver', () => {
  localStorage.clear();
  assert.deepEqual(store.attempts(), []);
});

test('store.addAttempt: adiciona tentativa', () => {
  localStorage.clear();
  const attempt = {
    id: 'DIA1-SIM1-123456',
    examId: 'DIA1-SIM1',
    finishedAt: Date.now(),
    mode: 'exam',
    lang: 'pt',
    correct: 40,
    total: 53,
    percent: 0.75,
  };
  
  store.addAttempt(attempt);
  const attempts = store.attempts();
  
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].id, 'DIA1-SIM1-123456');
});

test('store.addAttempt: mantém no máximo 200 tentativas', () => {
  localStorage.clear();
  
  // Adiciona 205 tentativas
  for (let i = 0; i < 205; i++) {
    store.addAttempt({
      id: `attempt-${i}`,
      examId: 'DIA1-SIM1',
      finishedAt: Date.now() + i,
      mode: 'exam',
      correct: 40,
      total: 53,
      percent: 0.75,
    });
  }
  
  const attempts = store.attempts();
  assert.equal(attempts.length, 200);
});

test('store.addAttempt: mais recentes primeiro', () => {
  localStorage.clear();
  
  store.addAttempt({ id: 'first', examId: 'DIA1-SIM1', finishedAt: 1000, correct: 10, total: 53, percent: 0.2 });
  store.addAttempt({ id: 'second', examId: 'DIA1-SIM1', finishedAt: 2000, correct: 20, total: 53, percent: 0.4 });
  
  const attempts = store.attempts();
  assert.equal(attempts[0].id, 'second');
  assert.equal(attempts[1].id, 'first');
});

test('store.attempt: encontra tentativa por ID', () => {
  localStorage.clear();
  
  store.addAttempt({ id: 'test-123', examId: 'DIA1-SIM1', finishedAt: Date.now(), correct: 40, total: 53, percent: 0.75 });
  
  const found = store.attempt('test-123');
  assert.equal(found.id, 'test-123');
  assert.equal(found.examId, 'DIA1-SIM1');
});

test('store.attempt: retorna null se não encontrar', () => {
  localStorage.clear();
  assert.equal(store.attempt('inexistente'), null);
});

test('store.clearAttempts: limpa todas as tentativas', () => {
  localStorage.clear();
  
  store.addAttempt({ id: 'test-1', examId: 'DIA1-SIM1', finishedAt: Date.now(), correct: 40, total: 53, percent: 0.75 });
  store.clearAttempts();
  
  assert.deepEqual(store.attempts(), []);
});

test('store.importAttempts: importa novas tentativas', () => {
  localStorage.clear();
  
  const newAttempts = [
    { id: 'import-1', examId: 'DIA1-SIM1', finishedAt: 1000, correct: 40, total: 53, percent: 0.75 },
    { id: 'import-2', examId: 'DIA1-SIM2', finishedAt: 2000, correct: 45, total: 53, percent: 0.85 },
  ];
  
  const result = store.importAttempts(newAttempts);
  
  assert.equal(result.imported, 2);
  assert.equal(result.duplicates, 0);
  assert.equal(store.attempts().length, 2);
});

test('store.importAttempts: ignora duplicatas', () => {
  localStorage.clear();
  
  store.addAttempt({ id: 'existing', examId: 'DIA1-SIM1', finishedAt: 1000, correct: 40, total: 53, percent: 0.75 });
  
  const newAttempts = [
    { id: 'existing', examId: 'DIA1-SIM1', finishedAt: 1000, correct: 40, total: 53, percent: 0.75 },
    { id: 'new', examId: 'DIA1-SIM2', finishedAt: 2000, correct: 45, total: 53, percent: 0.85 },
  ];
  
  const result = store.importAttempts(newAttempts);
  
  assert.equal(result.imported, 1);
  assert.equal(result.duplicates, 1);
  assert.equal(store.attempts().length, 2);
});

test('store.importAttempts: valida formato', () => {
  localStorage.clear();
  
  const invalid = [
    { /* sem id */ examId: 'DIA1-SIM1', finishedAt: 1000 },
    { id: 'ok', examId: 'DIA1-SIM1', finishedAt: 2000, correct: 40, total: 53, percent: 0.75 },
  ];
  
  const result = store.importAttempts(invalid);
  
  assert.equal(result.imported, 1); // só a válida
});

test('store: tolera falhas de localStorage', () => {
  // Simula erro no localStorage
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('Quota exceeded'); };
  
  // Não deve lançar erro
  assert.doesNotThrow(() => {
    store.setPref('theme', 'dark');
  });
  
  // Restaura
  localStorage.setItem = originalSetItem;
});

// ---------- treinos ----------
test('store.saveTrain/train/trains: guarda a definição (só referências)', () => {
  localStorage.clear();
  const def = { id: 'TRAIN-a1', title: 'D2', refs: [['DIA1-SIM1', 1], ['DIA1-SIM2', 4]], createdAt: 1 };
  store.saveTrain(def);
  assert.deepEqual(store.train('TRAIN-a1'), def);
  assert.equal(store.train('TRAIN-inexistente'), null);
  assert.deepEqual(store.trains().map((d) => d.id), ['TRAIN-a1']); // o treino recém-criado não é apagado pela limpeza
});

test('store.pruneTrains: apaga treino sem sessão e sem tentativa; mantém os demais', () => {
  localStorage.clear();
  store.saveTrain({ id: 'TRAIN-velho', title: 'x', refs: [], createdAt: 1 });
  store.saveTrain({ id: 'TRAIN-comsessao', title: 'y', refs: [], createdAt: 2 });
  store.saveSession('TRAIN-comsessao', { mode: 'study' });
  store.saveTrain({ id: 'TRAIN-comtentativa', title: 'z', refs: [], createdAt: 3 });
  store.addAttempt({ id: 'a', examId: 'TRAIN-comtentativa', finishedAt: 1, correct: 0, total: 0, percent: 0 });
  store.saveTrain({ id: 'TRAIN-novo', title: 'n', refs: [], createdAt: 4 });
  assert.equal(store.train('TRAIN-velho'), null);
  assert.ok(store.train('TRAIN-comsessao'));
  assert.ok(store.train('TRAIN-comtentativa'));
  assert.ok(store.train('TRAIN-novo'));
});

test('store.clearAttempts: libera os treinos que só existiam por causa do histórico', () => {
  localStorage.clear();
  store.saveTrain({ id: 'TRAIN-h1', title: 'h', refs: [], createdAt: 1 });
  store.addAttempt({ id: 'h', examId: 'TRAIN-h1', finishedAt: 1, correct: 0, total: 0, percent: 0 });
  store.clearAttempts();
  assert.equal(store.train('TRAIN-h1'), null);
});

// ---------- importação e exportação do histórico ----------
const att = (over = {}) => ({ id: 'a1', examId: 'DIA1-SIM1', finishedAt: 1000, mode: 'exam', lang: 'pt', durationMs: 1, answers: { 1: [0] }, flags: [], correct: 40, total: 53, percent: 0.75, ...over });

test('store.importAttempts: devolve contadores (importadas, duplicadas, inválidas)', () => {
  localStorage.clear();
  store.addAttempt(att({ id: 'existente' }));
  const r = store.importAttempts([att({ id: 'existente' }), att({ id: 'nova' }), { id: 'lixo' }, null]);
  assert.deepEqual(r, { ok: true, imported: 1, duplicates: 1, invalid: 2, dropped: 0 });
});

test('store.importAttempts: conteúdo que não é histórico é recusado e nada é gravado', () => {
  localStorage.clear();
  for (const payload of [{ foo: 1 }, 'texto', 42, null]) assert.equal(store.importAttempts(payload).ok, false);
  assert.deepEqual(store.attempts(), []);
});

test('store.importAttempts: grava só campos conhecidos e recalcula o percentual', () => {
  localStorage.clear();
  store.importAttempts([att({ percent: 5, hack: '<script>' })]);
  const [saved] = store.attempts();
  assert.equal(saved.hack, undefined);
  assert.equal(saved.percent, 40 / 53);
});

test('store.importAttempts: respeita o limite de 200 e informa o que foi descartado', () => {
  localStorage.clear();
  const many = Array.from({ length: 230 }, (_, i) => att({ id: `m${i}`, finishedAt: 1000 + i }));
  const r = store.importAttempts({ attempts: many.slice(0, 200) });
  const r2 = store.importAttempts({ attempts: many.slice(200).map((a, i) => ({ ...a, finishedAt: 1 + i })) }); // mais antigas: ficam de fora
  assert.equal(r.imported, 200);
  assert.deepEqual([r2.imported, r2.dropped], [0, 30]);
  assert.equal(store.attempts().length, 200);
});

test('store.importAttempts: tentativa de treino sem a definição é recusada', () => {
  localStorage.clear();
  const r = store.importAttempts([att({ id: 't1', examId: 'TRAIN-abc1' })]);
  assert.deepEqual([r.imported, r.invalid], [0, 1]);
});

test('store.exportHistory -> importAttempts: ida e volta preserva treinos e tentativas', () => {
  localStorage.clear();
  store.saveTrain({ id: 'TRAIN-abc1', title: 'D2', refs: [['DIA1-SIM1', 1], ['DIA1-SIM2', 2]], createdAt: 1 });
  store.addAttempt(att({ id: 'oficial' }));
  store.addAttempt(att({ id: 'treino', examId: 'TRAIN-abc1', finishedAt: 2000 }));
  store.saveTrain({ id: 'TRAIN-solto', title: 'sem tentativa', refs: [['DIA1-SIM1', 3]], createdAt: 2 }); // será limpo: ninguém o usa
  const exported = JSON.parse(JSON.stringify(store.exportHistory()));
  assert.equal(exported.version, 2);
  assert.deepEqual(exported.trains.map((d) => d.id), ['TRAIN-abc1']); // só os treinos que alguma tentativa usa

  localStorage.clear(); // "outro navegador"
  const r = store.importAttempts(exported);
  assert.deepEqual([r.ok, r.imported, r.invalid], [true, 2, 0]);
  assert.deepEqual(store.train('TRAIN-abc1').refs, [['DIA1-SIM1', 1], ['DIA1-SIM2', 2]]);
  assert.equal(store.attempts().length, 2);
});

test('store.importAttempts: formato antigo (lista) continua funcionando', () => {
  localStorage.clear();
  assert.equal(store.importAttempts([att({ id: 'velho' })]).imported, 1);
});

test('store.saveTrain: treino recém-criado (outra aba abrindo a sessão) não é apagado por outro treino', () => {
  localStorage.clear();
  store.saveTrain({ id: 'TRAIN-aba1', title: 'a', refs: [['DIA1-SIM1', 1]], createdAt: Date.now() });
  store.saveTrain({ id: 'TRAIN-aba2', title: 'b', refs: [['DIA1-SIM1', 2]], createdAt: Date.now() });
  assert.ok(store.train('TRAIN-aba1'));
  assert.ok(store.train('TRAIN-aba2'));
});
