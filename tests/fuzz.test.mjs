// Fuzz leve (sem biblioteca) do importador e do store: JSON aleatório com semente fixa (reprodutível),
// tipos trocados, ciclos, strings enormes e chaves perigosas (__proto__). Propriedades verificadas:
//   1. nada lança exceção; 2. tudo que sai satisfaz as regras; 3. nada polui Object.prototype.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const memory = {};
global.localStorage = {
  getItem: (key) => (key in memory ? memory[key] : null),
  setItem: (key, value) => { memory[key] = String(value); },
  removeItem: (key) => { delete memory[key]; },
  clear: () => { for (const key of Object.keys(memory)) delete memory[key]; },
};

const { normalizeAttempt, normalizeTrain, parseHistory, MAX_ATTEMPTS_PER_IMPORT } = await import('../assets/js/importer.js');
const { store } = await import('../assets/js/store.js');

const SEED = 20261110;
const CASES = 600;

// ---------- gerador pseudoaleatório determinístico (mulberry32) ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGen(seed) {
  const rand = rng(seed);
  const int = (n) => Math.floor(rand() * n);
  const pick = (list) => list[int(list.length)];
  const NASTY_KEYS = ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', '', ' ', '1', '999', '-1', '1.5', 'id', 'answers', 'refs'];
  const NASTY_STRINGS = ['', ' ', '__proto__', '../../etc/passwd', '<script>alert(1)</script>', 'DIA1-SIM1', 'TRAIN-abc', 'TRAIN-', 'DIA1-SIM1\n', '\u0000', '😀'.repeat(50), 'x'.repeat(100_000), 'DIA999-SIM999', 'dia1-sim1'];
  const NASTY_NUMBERS = [0, -0, 1, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER, 2 ** 53, 1e308, 500, 501, 4, 5, 1_700_000_000_000];

  function scalar() {
    switch (int(6)) {
      case 0: return pick(NASTY_NUMBERS);
      case 1: return pick(NASTY_STRINGS);
      case 2: return null;
      case 3: return undefined;
      case 4: return rand() < 0.5;
      default: return int(10);
    }
  }
  function value(depth = 0) {
    if (depth > 3 || rand() < 0.4) return scalar();
    if (rand() < 0.5) return Array.from({ length: int(6) }, () => value(depth + 1));
    return object(depth + 1);
  }
  function object(depth = 0) {
    // JSON.parse cria "__proto__" como chave própria (como um arquivo real faria)
    const obj = {};
    for (let i = int(6); i > 0; i--) {
      const key = pick(NASTY_KEYS);
      Object.defineProperty(obj, key, { value: value(depth + 1), enumerable: true, writable: true, configurable: true });
    }
    return obj;
  }
  function validAttempt(i) {
    const total = 1 + int(60);
    return {
      id: `att-${i}-${int(1e6)}`,
      examId: rand() < 0.7 ? `DIA${1 + int(3)}-SIM${1 + int(3)}` : `TRAIN-${(1e6 + int(1e6)).toString(36)}`,
      finishedAt: 1_700_000_000_000 + int(1e9),
      mode: pick(['exam', 'study', 'x', 1]),
      lang: pick(['pt', 'en', 'fr']),
      durationMs: pick([0, 1000, 5_400_000, -5, 9e12, NaN, '5']),
      answers: Object.fromEntries(Array.from({ length: int(8) }, () => [String(1 + int(70)), Array.from({ length: int(4) }, () => pick([0, 1, 2, 3, 4, 5, -1, 1.5, '2', null]))])),
      flags: Array.from({ length: int(6) }, () => pick([1, 2, 3, 600, 0, -3, 'a', null])),
      total,
      correct: int(total + 3),
      percent: pick([0.5, 999, -1, 'x', null]),
    };
  }
  // Parte de uma tentativa válida e estraga de 1 a 3 campos (acha casos de fronteira que o aleatório puro raramente acerta).
  function corrupted(i) {
    const att = validAttempt(i);
    const keys = Object.keys(att);
    for (let n = 1 + int(3); n > 0; n--) {
      const key = pick(keys);
      if (rand() < 0.25) delete att[key];
      else att[key] = rand() < 0.5 ? scalar() : value();
    }
    return att;
  }
  function validTrain(i) {
    return {
      id: `TRAIN-${(1e6 + i).toString(36)}`,
      title: pick(['Treino', '  espaços  ', 'x'.repeat(500), '', '   ', 42]),
      refs: Array.from({ length: int(5) }, () => pick([[`DIA1-SIM${1 + int(3)}`, 1 + int(60)], ['DIA1-SIM1', 0], ['../x', 1], ['DIA1-SIM1'], 'x', null, ['DIA1-SIM1', 1.5]])),
      createdAt: pick([1_700_000_000_000, NaN, 'x', undefined]),
    };
  }
  function payload(i) {
    switch (int(8)) {
      case 0: return value();
      case 1: return object();
      case 2: return Array.from({ length: int(8) }, () => (rand() < 0.5 ? validAttempt(i) : corrupted(i)));
      case 3: return { attempts: Array.from({ length: int(8) }, () => corrupted(i)), trains: Array.from({ length: int(5) }, () => (rand() < 0.5 ? validTrain(i) : value())) };
      case 4: return { attempts: value(), trains: value() };
      case 5: return { attempts: Array.from({ length: MAX_ATTEMPTS_PER_IMPORT + int(20) }, () => validAttempt(i)) }; // acima do limite
      case 6: return JSON.parse('{"__proto__":{"polluted":true},"attempts":[{"__proto__":{"polluted":true},"id":"a","examId":"DIA1-SIM1","finishedAt":1,"total":1,"correct":1,"answers":{"__proto__":[1],"constructor":[1]}}]}');
      default: return { version: 2, attempts: [corrupted(i), corrupted(i)], trains: [validTrain(i), corrupted(i)] };
    }
  }
  return { rand, int, pick, value, object, corrupted, validAttempt, validTrain, payload };
}

// ---------- regras que TUDO que sai do importador precisa cumprir ----------
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

function assertCleanAttempt(a, where) {
  assert.ok(a && typeof a === 'object' && !Array.isArray(a), `${where}: não é objeto`);
  assert.match(a.id, /^[A-Za-z0-9._+-]{1,120}$/, `${where}: id`);
  assert.match(a.examId, /^(DIA\d{1,3}-SIM\d{1,3}|TRAIN-[a-z0-9]+)$/, `${where}: examId`);
  assert.ok(Number.isFinite(a.finishedAt) && a.finishedAt > 0, `${where}: finishedAt`);
  assert.ok(['exam', 'study'].includes(a.mode), `${where}: mode`);
  assert.ok(['pt', 'en'].includes(a.lang), `${where}: lang`);
  assert.ok(Number.isFinite(a.durationMs) && a.durationMs >= 0 && a.durationMs <= 24 * 3600 * 1000, `${where}: durationMs`);
  assert.ok(isInt(a.total, 1, 500) && isInt(a.correct, 0, a.total), `${where}: total/correct`);
  assert.equal(a.percent, a.correct / a.total, `${where}: percent recalculado`);
  assert.ok(a.percent >= 0 && a.percent <= 1, `${where}: percent fora de 0..1`);
  assert.ok(Array.isArray(a.flags) && a.flags.every((n) => isInt(n, 1, 500)) && new Set(a.flags).size === a.flags.length, `${where}: flags`);
  assert.equal(Object.getPrototypeOf(a.answers), Object.prototype, `${where}: answers`);
  for (const [key, picked] of Object.entries(a.answers)) {
    assert.match(key, /^\d{1,3}$/, `${where}: chave de resposta`);
    assert.ok(Array.isArray(picked) && picked.length >= 1 && picked.every((i) => isInt(i, 0, 4)), `${where}: respostas`);
    assert.deepEqual(picked, [...new Set(picked)].sort((x, y) => x - y), `${where}: respostas sem repetição e em ordem`);
  }
  assert.deepEqual(Object.keys(a).sort(), ['answers', 'correct', 'durationMs', 'examId', 'finishedAt', 'flags', 'id', 'lang', 'mode', 'percent', 'total'], `${where}: só os campos conhecidos`);
}

function assertCleanTrain(d, where) {
  assert.match(d.id, /^TRAIN-[a-z0-9]+$/, `${where}: id`);
  assert.ok(typeof d.title === 'string' && d.title.length >= 1 && d.title.length <= 80 && d.title === d.title.trim(), `${where}: title`);
  assert.ok(Array.isArray(d.refs) && d.refs.length >= 1 && d.refs.length <= 500, `${where}: refs`);
  for (const ref of d.refs) {
    assert.ok(Array.isArray(ref) && ref.length === 2 && /^DIA\d{1,3}-SIM\d{1,3}$/.test(ref[0]) && isInt(ref[1], 1, 500), `${where}: ref`);
  }
  assert.ok(Number.isFinite(d.createdAt), `${where}: createdAt`);
  assert.deepEqual(Object.keys(d).sort(), ['createdAt', 'id', 'refs', 'title'], `${where}: só os campos conhecidos`);
}

const noPollution = () => {
  assert.equal({}.polluted, undefined, 'Object.prototype foi poluído');
  assert.equal([].polluted, undefined, 'Array.prototype foi poluído');
};

beforeEach(() => localStorage.clear());

// ---------- importador ----------
test(`fuzz: normalizeAttempt / normalizeTrain nunca lançam e só devolvem objetos limpos (${CASES} casos)`, () => {
  const gen = makeGen(SEED);
  let accepted = 0;
  for (let i = 0; i < CASES; i++) {
    const raw = i % 3 === 0 ? gen.value() : i % 3 === 1 ? gen.corrupted(i) : gen.object();
    const a = normalizeAttempt(raw);
    if (a) { accepted += 1; assertCleanAttempt(a, `caso ${i}`); }
    const d = normalizeTrain(i % 2 ? gen.validTrain(i) : raw);
    if (d) assertCleanTrain(d, `caso ${i} (treino)`);
    assert.ok(a === null || typeof a === 'object');
  }
  assert.ok(accepted > 20, `o gerador precisa produzir também casos aceitos (só ${accepted}); senão o teste não exercita as regras`);
  noPollution();
});

test(`fuzz: parseHistory nunca lança; saída respeita as regras e os limites (${CASES} casos)`, () => {
  const gen = makeGen(SEED + 1);
  let withAttempts = 0;
  for (let i = 0; i < CASES; i++) {
    const payload = gen.payload(i);
    const result = parseHistory(payload);
    assert.equal(typeof result.ok, 'boolean');
    assert.ok(Array.isArray(result.attempts) && Array.isArray(result.trains) && Number.isInteger(result.invalid) && result.invalid >= 0);
    assert.ok(result.attempts.length <= MAX_ATTEMPTS_PER_IMPORT && result.trains.length <= MAX_ATTEMPTS_PER_IMPORT);
    if (!result.ok) assert.deepEqual([result.attempts, result.trains, result.invalid], [[], [], 0]);
    if (result.attempts.length) withAttempts += 1;
    result.attempts.forEach((a, k) => assertCleanAttempt(a, `payload ${i} tentativa ${k}`));
    result.trains.forEach((d, k) => assertCleanTrain(d, `payload ${i} treino ${k}`));
  }
  assert.ok(withAttempts > 30, `poucos payloads com tentativas aceitas (${withAttempts})`);
  noPollution();
});

test('fuzz: estruturas com CICLO e profundidade absurda não derrubam o importador', () => {
  const cyc = { id: 'a', examId: 'DIA1-SIM1', finishedAt: 1, total: 1, correct: 1, answers: {}, flags: [] };
  cyc.self = cyc;
  cyc.answers.loop = cyc;
  cyc.flags.push(cyc);
  const list = [cyc];
  list.push(list);
  assert.doesNotThrow(() => parseHistory(list));
  assert.doesNotThrow(() => parseHistory({ attempts: list, trains: list }));
  assert.equal(parseHistory(list).attempts[0].id, 'a');

  let deep = [];
  for (let i = 0; i < 50_000; i++) deep = [deep];
  assert.doesNotThrow(() => parseHistory(deep));
  assert.doesNotThrow(() => parseHistory({ attempts: [{ answers: deep, flags: deep }] }));
});

test('fuzz: valores exóticos (Proxy que lança, getter que lança, BigInt, Symbol, função) não derrubam o importador', () => {
  const evil = [
    new Proxy({}, { get() { throw new Error('boom'); }, ownKeys() { throw new Error('boom'); } }),
    { get id() { throw new Error('getter'); } },
    { id: 10n, examId: Symbol('x'), finishedAt: () => 1, total: 1n, correct: 0n },
    [Symbol('s'), 10n, () => 1],
  ];
  for (const raw of evil) {
    for (const wrap of [(x) => x, (x) => [x], (x) => ({ attempts: [x], trains: [x] })]) {
      let result;
      try {
        result = parseHistory(wrap(raw));
      } catch (error) {
        assert.fail(`parseHistory lançou com valor hostil: ${error.message}`);
      }
      assert.equal(result.attempts.length, 0);
    }
  }
});

test('fuzz: __proto__ / constructor nos dados importados não poluem protótipos nem viram resposta', () => {
  const payload = JSON.parse('{"attempts":[{"id":"p1","examId":"DIA1-SIM1","finishedAt":5,"total":2,"correct":1,"answers":{"__proto__":[1],"constructor":[2],"1":[0]},"__proto__":{"polluted":true}}],"__proto__":{"polluted":true}}');
  const { attempts } = parseHistory(payload);
  assert.equal(attempts.length, 1);
  assert.deepEqual(attempts[0].answers, { 1: [0] });
  assert.equal(attempts[0].polluted, undefined);
  noPollution();
});

// ---------- store.importAttempts (importador + persistência) ----------
test(`fuzz: store.importAttempts nunca lança; o que fica gravado satisfaz as regras e os limites (${CASES} casos)`, () => {
  const gen = makeGen(SEED + 2);
  for (let i = 0; i < CASES; i++) {
    if (i % 50 === 0) localStorage.clear();
    const summary = store.importAttempts(gen.payload(i));
    assert.equal(typeof summary.ok, 'boolean');
    for (const field of ['imported', 'duplicates', 'invalid', 'dropped']) assert.ok(Number.isInteger(summary[field]) && summary[field] >= 0, `${field}: ${summary[field]}`);

    const stored = store.attempts();
    assert.ok(stored.length <= 200, 'limite de tentativas guardadas');
    const ids = stored.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length, 'ids únicos');
    for (let k = 1; k < stored.length; k++) assert.ok(stored[k - 1].finishedAt >= stored[k].finishedAt, 'mais recentes primeiro');
    for (const a of stored) {
      assertCleanAttempt(a, `store caso ${i}`);
      // toda tentativa de treino guardada precisa ter a definição do treino (senão o resultado não abre)
      if (a.examId.startsWith('TRAIN-')) assert.ok(store.train(a.examId), `treino ${a.examId} sem definição (caso ${i})`);
    }
    for (const def of store.trains()) assertCleanTrain(def, `store treino caso ${i}`);
  }
  noPollution();
});

test('fuzz: importar o mesmo arquivo duas vezes é idempotente (a segunda só conta duplicatas)', () => {
  const gen = makeGen(SEED + 3);
  for (let i = 0; i < 60; i++) {
    localStorage.clear();
    const payload = { attempts: Array.from({ length: 1 + gen.int(8) }, () => gen.corrupted(i)), trains: Array.from({ length: gen.int(3) }, () => gen.validTrain(i)) };
    const first = store.importAttempts(payload);
    const snapshot = JSON.stringify(store.attempts());
    const second = store.importAttempts(payload);
    assert.equal(second.imported, 0, `caso ${i}: reimportar não deve adicionar`);
    assert.equal(JSON.stringify(store.attempts()), snapshot, `caso ${i}: reimportar não deve alterar nada`);
    assert.ok(second.duplicates >= first.imported, `caso ${i}: o que entrou antes agora é duplicata`);
  }
});

test('fuzz: round-trip — exportar e importar em outro armazenamento preserva as tentativas válidas', () => {
  const gen = makeGen(SEED + 4);
  for (let i = 0; i < 40; i++) {
    localStorage.clear();
    store.importAttempts({ attempts: Array.from({ length: 1 + gen.int(10) }, () => gen.validAttempt(i)), trains: Array.from({ length: 4 }, () => gen.validTrain(i)) });
    const exported = JSON.parse(JSON.stringify(store.exportHistory()));
    const before = store.attempts();
    localStorage.clear();
    const summary = store.importAttempts(exported);
    assert.equal(summary.invalid, 0, `caso ${i}: nada do que o próprio site exporta pode ser rejeitado`);
    assert.deepEqual(store.attempts(), before, `caso ${i}: round-trip`);
  }
});

test('fuzz: armazenamento corrompido (JSON quebrado, tipos errados) não derruba o store nem o import', () => {
  const gen = makeGen(SEED + 5);
  const garbage = ['{', 'null', '42', '"texto"', '[1,2,3]', '{"a":1}', '[null]', '[[],{}]', 'undefined', ''];
  for (let i = 0; i < 100; i++) {
    for (const key of ['attempts', 'trains']) localStorage.setItem(`ccdv.${key}`, gen.pick(garbage));
    localStorage.setItem('ccdv.train.TRAIN-x', gen.pick(garbage));
    assert.doesNotThrow(() => store.importAttempts(gen.payload(i)), `caso ${i}`);
    assert.doesNotThrow(() => { store.exportHistory(); store.attempts(); store.trains(); store.clearAttempts(); }, `caso ${i} (leitura)`);
  }
});
