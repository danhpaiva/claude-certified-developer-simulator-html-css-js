import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// localStorage simulado ANTES de importar os módulos (o store o usa)
const memory = {};
global.localStorage = {
  getItem: (key) => (key in memory ? memory[key] : null),
  setItem: (key, value) => { memory[key] = String(value); },
  removeItem: (key) => { delete memory[key]; },
  clear: () => { for (const key of Object.keys(memory)) delete memory[key]; },
};

const { store } = await import('../assets/js/store.js');
const { loadManifest, loadOfficialExam, loadAllExams, loadExam, clearExamCaches } = await import('../assets/js/exams.js');

// fetch simulado: tabela caminho -> resposta. Registra cada chamada.
let calls = [];
let routes = {};
global.fetch = async (path, options) => {
  calls.push({ path, options });
  const route = routes[path];
  if (!route) return { ok: false, status: 404, json: async () => ({}) };
  if (route.throws) throw route.throws;
  if (route.badJson) return { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } };
  return { ok: route.status === undefined || route.status < 400, status: route.status ?? 200, json: async () => route.body };
};
const fetchedPaths = () => calls.map((c) => c.path);
const exam = (id, nums) => ({ id, day: 1, set: 1, minutes: 120, total: nums.length, questions: nums.map((num) => ({ num, domain: 2, answer: [0], pt: {}, en: {} })) });

beforeEach(() => {
  calls = [];
  routes = {};
  localStorage.clear();
  clearExamCaches();
});

// ---------- manifesto ----------
test('loadManifest: baixa uma vez e reaproveita (mesmo com chamadas simultâneas)', async () => {
  routes['data/exams.json'] = { body: { exams: [] } };
  const [a, b] = await Promise.all([loadManifest(), loadManifest()]);
  await loadManifest();
  assert.equal(a, b);
  assert.equal(calls.length, 1);
});

test('loadManifest: pede sem cache HTTP (no-cache), para sempre enxergar simulados novos', async () => {
  routes['data/exams.json'] = { body: {} };
  await loadManifest();
  assert.deepEqual(calls[0].options, { cache: 'no-cache' });
});

test('loadManifest: uma falha NÃO fica em cache; a próxima tentativa baixa de novo e funciona', async () => {
  routes['data/exams.json'] = { status: 500 };
  await assert.rejects(loadManifest());
  routes['data/exams.json'] = { body: { exams: [{ id: 'DIA1-SIM1' }] } };
  assert.deepEqual(await loadManifest(), { exams: [{ id: 'DIA1-SIM1' }] });
  assert.equal(calls.length, 2);
});

// ---------- simulado oficial ----------
test('loadOfficialExam: ids fora do padrão são recusados SEM baixar nada', async () => {
  for (const id of ['D1-S1', 'dia1-sim1', 'DIA1-SIM1.json', 'DIA1-SIM1/../x', '../DIA1-SIM1', '', 'DIA-SIM1', 'DIA1-SIM', 'DIA1-SIM1 ']) {
    await assert.rejects(loadOfficialExam(id), (e) => e.notFound === true, JSON.stringify(id));
  }
  assert.equal(calls.length, 0);
});

test('loadOfficialExam: baixa o arquivo certo e reaproveita; chamadas simultâneas dividem 1 download', async () => {
  routes['data/exams/DIA1-SIM1.json'] = { body: exam('DIA1-SIM1', [1]) };
  const [a, b] = await Promise.all([loadOfficialExam('DIA1-SIM1'), loadOfficialExam('DIA1-SIM1')]);
  await loadOfficialExam('DIA1-SIM1');
  assert.equal(a, b);
  assert.deepEqual(fetchedPaths(), ['data/exams/DIA1-SIM1.json']);
});

test('loadOfficialExam: 404 => "não encontrado"', async () => {
  await assert.rejects(loadOfficialExam('DIA9-SIM9'), (e) => e.notFound === true && e.status === 404);
});

test('loadOfficialExam: 500, rede caída e JSON quebrado NÃO são "não encontrado" (o usuário pode tentar de novo)', async () => {
  routes['data/exams/DIA1-SIM1.json'] = { status: 500 };
  routes['data/exams/DIA1-SIM2.json'] = { throws: new TypeError('Failed to fetch') };
  routes['data/exams/DIA1-SIM3.json'] = { badJson: true };
  for (const id of ['DIA1-SIM1', 'DIA1-SIM2', 'DIA1-SIM3']) {
    await assert.rejects(loadOfficialExam(id), (e) => e.notFound !== true, id);
  }
});

test('loadOfficialExam: falha não fica em cache (recupera quando o servidor volta)', async () => {
  routes['data/exams/DIA1-SIM1.json'] = { status: 503 };
  await assert.rejects(loadOfficialExam('DIA1-SIM1'));
  routes['data/exams/DIA1-SIM1.json'] = { body: exam('DIA1-SIM1', [1, 2]) };
  assert.equal((await loadOfficialExam('DIA1-SIM1')).questions.length, 2);
});

test('loadOfficialExam: 404 também não fica em cache (um simulado publicado depois passa a existir)', async () => {
  await assert.rejects(loadOfficialExam('DIA3-SIM1'));
  routes['data/exams/DIA3-SIM1.json'] = { body: exam('DIA3-SIM1', [1]) };
  assert.equal((await loadOfficialExam('DIA3-SIM1')).id, 'DIA3-SIM1');
});

// ---------- todos os simulados ----------
test('loadAllExams: ignora os que falham e indexa os que carregam', async () => {
  routes['data/exams/DIA1-SIM1.json'] = { body: exam('DIA1-SIM1', [1]) };
  routes['data/exams/DIA1-SIM2.json'] = { status: 500 };
  routes['data/exams/DIA1-SIM3.json'] = { body: exam('DIA1-SIM3', [1]) };
  const all = await loadAllExams({ exams: [{ id: 'DIA1-SIM1' }, { id: 'DIA1-SIM2' }, { id: 'DIA1-SIM3' }] });
  assert.deepEqual(Object.keys(all).sort(), ['DIA1-SIM1', 'DIA1-SIM3']);
});

test('loadAllExams: manifesto vazio => objeto vazio, e id inválido no manifesto é ignorado', async () => {
  assert.deepEqual(await loadAllExams({ exams: [] }), {});
  assert.deepEqual(await loadAllExams({ exams: [{ id: '../x' }] }), {});
  assert.equal(calls.length, 0);
});

// ---------- loadExam (oficial e treino) ----------
test('loadExam: id oficial vai direto ao simulado', async () => {
  routes['data/exams/DIA1-SIM1.json'] = { body: exam('DIA1-SIM1', [1]) };
  assert.equal((await loadExam('DIA1-SIM1')).id, 'DIA1-SIM1');
});

const saveTrain = (id, refs) => store.saveTrain({ id, title: 'D2', refs, createdAt: 1 });

test('loadExam: treino sem definição guardada => "não encontrado", sem rede', async () => {
  await assert.rejects(loadExam('TRAIN-sumiu'), (e) => e.notFound === true);
  assert.equal(calls.length, 0);
});

test('loadExam: treino é remontado das referências, na ordem, renumerado, baixando cada simulado UMA vez', async () => {
  routes['data/exams/DIA1-SIM1.json'] = { body: exam('DIA1-SIM1', [1, 2, 3]) };
  routes['data/exams/DIA2-SIM1.json'] = { body: exam('DIA2-SIM1', [1, 2]) };
  saveTrain('TRAIN-abc1', [['DIA2-SIM1', 2], ['DIA1-SIM1', 3], ['DIA1-SIM1', 1], ['DIA2-SIM1', 1]]);
  const train = await loadExam('TRAIN-abc1');
  assert.deepEqual(train.questions.map((q) => [q.num, q.sourceExamId, q.sourceNum]), [[1, 'DIA2-SIM1', 2], [2, 'DIA1-SIM1', 3], [3, 'DIA1-SIM1', 1], [4, 'DIA2-SIM1', 1]]);
  assert.equal(train.set, 'D2');
  assert.deepEqual(fetchedPaths().sort(), ['data/exams/DIA1-SIM1.json', 'data/exams/DIA2-SIM1.json']);
});

test('loadExam: se um simulado de origem foi REMOVIDO (404), o treino abre com as questões que sobraram', async () => {
  routes['data/exams/DIA1-SIM1.json'] = { body: exam('DIA1-SIM1', [1, 2]) };
  saveTrain('TRAIN-abc2', [['DIA1-SIM1', 1], ['DIA9-SIM9', 1], ['DIA1-SIM1', 2]]);
  const train = await loadExam('TRAIN-abc2');
  assert.deepEqual(train.questions.map((q) => q.sourceExamId), ['DIA1-SIM1', 'DIA1-SIM1']);
  assert.deepEqual(train.questions.map((q) => q.num), [1, 3]); // mantém a numeração original das respostas salvas
});

test('loadExam: se NENHUMA questão do treino existe mais => "não encontrado" (nunca uma prova vazia)', async () => {
  saveTrain('TRAIN-abc3', [['DIA9-SIM9', 1]]);
  await assert.rejects(loadExam('TRAIN-abc3'), (e) => e.notFound === true);
  saveTrain('TRAIN-abc4', [['DIA1-SIM1', 99]]); // simulado existe, mas a questão não
  routes['data/exams/DIA1-SIM1.json'] = { body: exam('DIA1-SIM1', [1]) };
  await assert.rejects(loadExam('TRAIN-abc4'), (e) => e.notFound === true);
});

test('loadExam: falha de REDE em um simulado de origem não é escondida (não vira treino pela metade)', async () => {
  routes['data/exams/DIA1-SIM1.json'] = { body: exam('DIA1-SIM1', [1]) };
  routes['data/exams/DIA2-SIM1.json'] = { throws: new TypeError('Failed to fetch') };
  saveTrain('TRAIN-abc5', [['DIA1-SIM1', 1], ['DIA2-SIM1', 1]]);
  await assert.rejects(loadExam('TRAIN-abc5'), (e) => e.notFound !== true && e instanceof TypeError);
});

test('loadExam: id que parece treino mas tem formato inválido é tratado como simulado oficial (e recusado)', async () => {
  for (const id of ['TRAIN-', 'train-abc', 'TRAIN-ABC']) await assert.rejects(loadExam(id), (e) => e.notFound === true, id);
  assert.equal(calls.length, 0);
});
