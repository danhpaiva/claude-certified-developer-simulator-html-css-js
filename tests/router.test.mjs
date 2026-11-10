import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, resolveRoute, createRouter } from '../assets/js/router.js';

// ---------- parseHash ----------
test('parseHash: caminho e query', () => {
  const { parts, params } = parseHash('#/exam/DIA1-SIM2?mode=study');
  assert.deepEqual(parts, ['exam', 'DIA1-SIM2']);
  assert.equal(params.get('mode'), 'study');
});

test('parseHash: hash vazio, só "#", "#/", null e undefined viram a raiz', () => {
  for (const hash of ['', '#', '#/', null, undefined]) assert.deepEqual(parseHash(hash).parts, [], String(hash));
});

test('parseHash: sem barra inicial, barras repetidas e barra final', () => {
  assert.deepEqual(parseHash('#exam/DIA1-SIM1').parts, ['exam', 'DIA1-SIM1']);
  assert.deepEqual(parseHash('#//exam//DIA1-SIM1//').parts, ['exam', 'DIA1-SIM1']);
});

test('parseHash: um segundo "?" na query é ignorado (comportamento mantido)', () => {
  assert.equal(parseHash('#/exam/X?mode=study?lixo=1').params.get('mode'), 'study');
});

test('parseHash: query vazia ou sem valor', () => {
  assert.equal([...parseHash('#/exam/X?').params].length, 0);
  assert.equal(parseHash('#/result/X?timeup').params.has('timeup'), true);
});

test('parseHash: não decodifica o caminho (ids com % ficam como vieram, sem lançar erro)', () => {
  assert.doesNotThrow(() => parseHash('#/exam/%E0%A4%A'));
  assert.deepEqual(parseHash('#/exam/a%20b').parts, ['exam', 'a%20b']);
});

// ---------- resolveRoute ----------
test('resolveRoute: telas sem parâmetros', () => {
  assert.deepEqual(resolveRoute('#/'), { name: 'home' });
  assert.deepEqual(resolveRoute('#/train'), { name: 'train' });
  assert.deepEqual(resolveRoute('#/stats'), { name: 'stats' });
});

test('resolveRoute: prova, com e sem modo', () => {
  assert.deepEqual(resolveRoute('#/exam/DIA1-SIM1'), { name: 'exam', id: 'DIA1-SIM1', mode: 'exam' });
  assert.deepEqual(resolveRoute('#/exam/DIA1-SIM1?mode=study'), { name: 'exam', id: 'DIA1-SIM1', mode: 'study' });
  assert.deepEqual(resolveRoute('#/exam/TRAIN-abc1?mode=study'), { name: 'exam', id: 'TRAIN-abc1', mode: 'study' });
});

test('resolveRoute: modo desconhecido ou com outra caixa vira prova (nunca estudo por engano)', () => {
  for (const q of ['?mode=foo', '?mode=STUDY', '?mode=', '?modo=study', '?mode=exam']) {
    assert.equal(resolveRoute('#/exam/DIA1-SIM1' + q).mode, 'exam', q);
  }
});

test('resolveRoute: resultado, com e sem timeup', () => {
  assert.deepEqual(resolveRoute('#/result/DIA1-SIM1-123'), { name: 'result', id: 'DIA1-SIM1-123', timeUp: false });
  assert.equal(resolveRoute('#/result/x?timeup=1').timeUp, true);
  assert.equal(resolveRoute('#/result/x?timeup').timeUp, true);
});

test('resolveRoute: prova ou resultado SEM id caem na home', () => {
  for (const hash of ['#/exam', '#/exam/', '#/result', '#/result/', '#/exam?mode=study']) assert.equal(resolveRoute(hash).name, 'home', hash);
});

test('resolveRoute: rotas desconhecidas caem na home; trechos extras em train/stats são ignorados', () => {
  assert.equal(resolveRoute('#/qualquer-coisa').name, 'home');
  assert.equal(resolveRoute('#/EXAM/DIA1-SIM1').name, 'home'); // caixa importa
  assert.equal(resolveRoute('#/train/extra').name, 'train');
  assert.equal(resolveRoute('#/stats/extra').name, 'stats');
});

test('resolveRoute: o id é mantido exatamente como veio (quem valida é o carregador)', () => {
  assert.equal(resolveRoute('#/exam/dia1-sim1').id, 'dia1-sim1');
  assert.equal(resolveRoute('#/exam/../etc').id, '..');
});

// ---------- createRouter ----------
const MANIFEST = { exams: [{ id: 'DIA1-SIM1' }] };
const EXAM = { id: 'DIA1-SIM1', questions: [] };

function setup(overrides = {}) {
  const log = [];
  const deps = {
    loadManifest: async () => { log.push('loadManifest'); return MANIFEST; },
    loadExam: async (id) => { log.push(`loadExam:${id}`); return { ...EXAM, id }; },
    getAttempt: (id) => (id === 'tentativa-1' ? { id, examId: 'DIA1-SIM1' } : null),
    showLoading: () => log.push('loading'),
    showError: (kind) => log.push(`error:${kind}`),
    show: (view) => { log.push(`show:${view.name}`); return undefined; },
    ...overrides,
  };
  return { router: createRouter(deps), log };
}

test('home, train e stats: mostram "carregando", carregam só o manifesto e desenham', async () => {
  for (const [hash, name] of [['#/', 'home'], ['#/train', 'train'], ['#/stats', 'stats']]) {
    const { router, log } = setup();
    await router.navigate(hash);
    assert.deepEqual(log, ['loading', 'loadManifest', `show:${name}`], hash);
  }
});

test('home recebe o manifesto', async () => {
  let received;
  const { router } = setup({ show: (view) => { received = view; } });
  await router.navigate('#/');
  assert.deepEqual(received, { name: 'home', manifest: MANIFEST });
});

test('prova: carrega o simulado e o manifesto e entrega o modo pedido', async () => {
  let received;
  const { router, log } = setup({ show: (view) => { received = view; } });
  await router.navigate('#/exam/DIA1-SIM1?mode=study');
  assert.ok(log.includes('loadExam:DIA1-SIM1') && log.includes('loadManifest'));
  assert.deepEqual([received.name, received.mode, received.exam.id, received.manifest], ['exam', 'study', 'DIA1-SIM1', MANIFEST]);
});

test('resultado: usa o examId da TENTATIVA (não o id da URL) e repassa timeUp', async () => {
  let received;
  const { router, log } = setup({ show: (view) => { received = view; } });
  await router.navigate('#/result/tentativa-1?timeup=1');
  assert.ok(log.includes('loadExam:DIA1-SIM1'));
  assert.deepEqual([received.name, received.timeUp, received.attempt.id], ['result', true, 'tentativa-1']);
});

test('resultado de tentativa inexistente: tela própria e nada é baixado', async () => {
  const { router, log } = setup();
  await router.navigate('#/result/nao-existe');
  assert.deepEqual(log, ['loading', 'show:missingAttempt']);
});

test('erro "não encontrado" vs "falha de carga" são telas diferentes', async () => {
  const notFound = Object.assign(new Error('x'), { notFound: true });
  let { router, log } = setup({ loadExam: async () => { throw notFound; } });
  await router.navigate('#/exam/DIA9-SIM9');
  assert.deepEqual(log.filter((l) => l.startsWith('error')), ['error:notFound']);

  ({ router, log } = setup({ loadExam: async () => { throw new TypeError('Failed to fetch'); } }));
  await router.navigate('#/exam/DIA1-SIM1');
  assert.deepEqual(log.filter((l) => l.startsWith('error')), ['error:loadError']);
});

test('falha ao carregar o manifesto vira "falha de carga"', async () => {
  const { router, log } = setup({ loadManifest: async () => { throw new Error('500'); } });
  await router.navigate('#/');
  assert.deepEqual(log, ['loading', 'error:loadError']);
});

test('rejeições estranhas (string, null) não derrubam o roteador', async () => {
  for (const value of ['texto', null, undefined, 42]) {
    const { router, log } = setup({ loadManifest: () => Promise.reject(value) });
    await router.navigate('#/');
    assert.deepEqual(log.filter((l) => l.startsWith('error')), ['error:loadError'], String(value));
  }
});

test('resultado: simulado da tentativa não existe mais => "não encontrado"', async () => {
  const gone = Object.assign(new Error('x'), { notFound: true });
  const { router, log } = setup({ loadExam: async () => { throw gone; } });
  await router.navigate('#/result/tentativa-1');
  assert.deepEqual(log.filter((l) => l.startsWith('error')), ['error:notFound']);
});

// ---------- navegações concorrentes ----------
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('a navegação mais recente vence: resposta atrasada da antiga é descartada', async () => {
  const slow = deferred();
  const shown = [];
  const { router } = setup({
    loadExam: (id) => (id === 'DIA1-SIM1' ? slow.promise : Promise.resolve({ id })),
    show: (view) => { shown.push(`${view.name}:${view.exam?.id ?? ''}`); },
  });
  const first = router.navigate('#/exam/DIA1-SIM1');   // demora
  await router.navigate('#/exam/DIA2-SIM1');           // termina antes
  slow.resolve({ id: 'DIA1-SIM1' });
  await first;
  assert.deepEqual(shown, ['exam:DIA2-SIM1']); // a antiga nunca aparece por cima da nova
});

test('erro tardio de uma navegação antiga não mostra tela de erro por cima da nova', async () => {
  const slow = deferred();
  const { router, log } = setup({ loadManifest: (() => { let n = 0; return () => (++n === 1 ? slow.promise : Promise.resolve(MANIFEST)); })() });
  const first = router.navigate('#/');
  await router.navigate('#/train');
  slow.reject(new Error('rede caiu'));
  await first;
  assert.equal(log.some((l) => l.startsWith('error')), false);
  assert.equal(log.filter((l) => l.startsWith('show')).length, 1);
});

test('três navegações rápidas: só a última é desenhada', async () => {
  const gates = [deferred(), deferred(), deferred()];
  let call = 0;
  const shown = [];
  const { router } = setup({ loadManifest: () => gates[call++].promise, show: (view) => { shown.push(view.name); } });
  const a = router.navigate('#/');
  const b = router.navigate('#/stats');
  const c = router.navigate('#/train');
  gates[2].resolve(MANIFEST); gates[0].resolve(MANIFEST); gates[1].resolve(MANIFEST);
  await Promise.all([a, b, c]);
  assert.deepEqual(shown, ['train']);
});

// ---------- dispose ----------
test('ao sair de uma tela, o dispose dela roda UMA vez e antes do "carregando" seguinte', async () => {
  const log = [];
  const { router } = setup({
    showLoading: () => log.push('loading'),
    show: (view) => { log.push(`show:${view.name}`); return () => log.push(`dispose:${view.name}`); },
  });
  await router.navigate('#/');
  await router.navigate('#/stats');
  await router.navigate('#/train');
  assert.deepEqual(log, ['loading', 'show:home', 'dispose:home', 'loading', 'show:stats', 'dispose:stats', 'loading', 'show:train']);
});

test('telas sem dispose (retorno undefined) não quebram a navegação seguinte', async () => {
  const { router, log } = setup();
  await router.navigate('#/');
  await assert.doesNotReject(router.navigate('#/stats'));
  assert.equal(log.filter((l) => l.startsWith('show')).length, 2);
});

test('navegação cancelada (superada) não deixa dispose pendurado nem chama show', async () => {
  const slow = deferred();
  const log = [];
  const { router } = setup({
    loadManifest: (() => { let n = 0; return () => (++n === 1 ? slow.promise : Promise.resolve(MANIFEST)); })(),
    show: (view) => { log.push(`show:${view.name}`); return () => log.push(`dispose:${view.name}`); },
  });
  const first = router.navigate('#/');
  await router.navigate('#/stats');
  slow.resolve(MANIFEST);
  await first;
  await router.navigate('#/train');
  assert.deepEqual(log, ['show:stats', 'dispose:stats', 'show:train']); // home (cancelada) nunca existiu
});

test('show que lança (bug de renderização) vira "falha de carga" e o dispose antigo não roda de novo', async () => {
  const log = [];
  let n = 0;
  const { router } = setup({
    showError: (kind) => log.push(`error:${kind}`),
    show: (view) => {
      if (++n === 2) throw new Error('bug na tela');
      log.push(`show:${view.name}`);
      return () => log.push('dispose');
    },
  });
  await router.navigate('#/');       // ok
  await router.navigate('#/stats');  // dispose da home, depois show lança
  await router.navigate('#/train');  // não há mais dispose para chamar
  assert.deepEqual(log, ['show:home', 'dispose', 'error:loadError', 'show:train']);
});

test('navegar duas vezes para o mesmo hash redesenha (usado por "refazer a tela")', async () => {
  const { router, log } = setup();
  await router.navigate('#/');
  await router.navigate('#/');
  assert.equal(log.filter((l) => l === 'show:home').length, 2);
});
