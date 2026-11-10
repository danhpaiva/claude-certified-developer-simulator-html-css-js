// Testa os validadores (validate-data, check-js, build, verify-build) contra repositórios sintéticos:
// um "bom" que precisa passar e vários com UM defeito proposital cada, que precisam falhar com a mensagem certa.
// Sem isso, um validador que parasse de enxergar um defeito (ou passasse a reclamar à toa) só seria notado tarde demais.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { metaContent, localPathOf, shareImagePaths } from '../scripts/site-paths.mjs';

const scripts = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
const HASH = 'abc1234';
const BASE = 'https://user.github.io/repo/';
const created = [];
after(() => { for (const dir of created) rmSync(dir, { recursive: true, force: true }); });

// ---------- ferramentas ----------
const write = (root, rel, content) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
};
const read = (root, rel) => readFileSync(join(root, rel), 'utf8');
const editJson = (root, rel, fn) => { const data = JSON.parse(read(root, rel)); fn(data); write(root, rel, JSON.stringify(data, null, 2)); };
const editText = (root, rel, fn) => write(root, rel, fn(read(root, rel)));
const remove = (root, rel) => rmSync(join(root, rel), { recursive: true, force: true });

function run(script, root, env = {}) {
  const result = spawnSync(process.execPath, [join(scripts, script)], { encoding: 'utf8', env: { ...process.env, CCDV_ROOT: root, CCDV_HASH: HASH, ...env } });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}
const ok = (result, label = '') => assert.equal(result.status, 0, `${label} deveria passar:\n${result.out}`);
function fails(result, expected, label = '') {
  assert.equal(result.status, 1, `${label} deveria falhar (exit 1):\n${result.out}`);
  assert.match(result.out, expected, `${label} mensagem inesperada:\n${result.out}`);
}

const png = (w, h) => {
  const bytes = Buffer.alloc(32);
  bytes[0] = 0x89;
  bytes.write('PNG', 1, 'latin1');
  bytes.writeUInt32BE(w, 16);
  bytes.writeUInt32BE(h, 20);
  return bytes;
};

// Questão válida. Todas as alternativas têm o mesmo tamanho: nenhum viés de comprimento.
const question = (num, domain, stem, over = {}) => {
  const content = (lang) => ({
    stem: `${stem} (${lang})`,
    options: ['Opção A', 'Opção B', 'Opção C', 'Opção D'],
    explanation: `Porque sim (${lang}).`,
  });
  return { num, domain, difficulty: 'easy', answer: [0], n: 1, source: 'https://docs.anthropic.com/x', verified: '2026-11', pt: content('pt'), en: content('en'), ...over };
};

const DOMAINS = { 1: 14.7, 2: 33.1, 3: 3.1, 4: 2.6, 5: 16.8, 6: 11.0, 7: 8.1, 8: 10.6 };

function writeExam(root, id, questions, extra = {}) {
  const perDomain = {};
  for (const q of questions) perDomain[q.domain] = (perDomain[q.domain] || 0) + 1;
  write(root, `data/exams/${id}.json`, JSON.stringify({ id, day: 1, set: 1, minutes: 120, total: questions.length, questions }));
  const entry = { id, day: 1, set: 1, total: questions.length, domains: perDomain, ...extra };
  if (existsSync(join(root, 'data/exams.json'))) editJson(root, 'data/exams.json', (m) => m.exams.push(entry));
  return entry;
}

// Repositório mínimo, completo e válido.
function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'ccdv-validators-'));
  created.push(root);
  write(root, 'data/exams.json', JSON.stringify({ domains: Object.fromEntries(Object.entries(DOMAINS).map(([id, weight]) => [id, { name: `D${id}`, weight }])), exams: [] }));
  write(root, 'pdfs/dia1/sim1/prova.pdf', '%PDF-1.4');
  writeExam(root, 'DIA1-SIM1', [question(1, 1, 'Primeira'), question(2, 2, 'Segunda'), question(3, 2, 'Terceira'), question(4, 5, 'Quarta')], { pdfs: { pt_prova: 'pdfs/dia1/sim1/prova.pdf' } });

  write(root, 'index.html', [
    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Simulador</title>',
    `<link rel="canonical" href="${BASE}">`,
    `<meta property="og:image" content="${BASE}docs/screenshots/share.png">`,
    `<meta property="twitter:image" content="${BASE}docs/screenshots/share.png">`,
    '<link rel="manifest" href="manifest.webmanifest">',
    '<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">',
    '<link rel="stylesheet" href="assets/style/main.css">',
    '</head><body><div id="app"></div><script type="module" src="assets/js/main.js"></script></body></html>',
  ].join('\n'));
  write(root, 'manifest.webmanifest', JSON.stringify({
    name: 'Simulador', short_name: 'Sim', start_url: './', display: 'standalone', theme_color: '#000', background_color: '#fff',
    icons: [
      { src: 'assets/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'assets/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'assets/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }));
  write(root, 'assets/icons/icon-192.png', png(192, 192));
  write(root, 'assets/icons/icon-512.png', png(512, 512));
  write(root, 'assets/icons/icon-512-maskable.png', png(512, 512));
  write(root, 'assets/icons/apple-touch-icon.png', png(180, 180));
  write(root, 'docs/screenshots/share.png', png(1200, 630));
  write(root, 'assets/style/main.css', 'body{margin:0}');
  write(root, 'assets/js/main.js', "import { x } from './util.js';\nimport { y } from '../js/other.js';\nexport const z = x + y;\n");
  write(root, 'assets/js/util.js', 'export const x = 1;\n');
  write(root, 'assets/js/other.js', "export const y = 2;\n");
  write(root, 'package.json', '{"type":"module"}');
  write(root, 'scripts/tool.mjs', 'export const t = 1;\n');
  write(root, 'sw.js', "const CACHE_VERSION = 'dev';\n// BUILD:PRECACHE_START\nconst PRECACHE = [];\n// BUILD:PRECACHE_END\n");
  return root;
}

const builtRepo = () => { const root = makeRepo(); ok(run('build.mjs', root), 'build do repositório base'); return root; };

// ======================= validate-data =======================
test('validate-data: repositório válido passa', () => {
  ok(run('validate-data.mjs', makeRepo()));
});

const dataDefects = [
  ['manifesto sem simulados', /manifesto sem simulados/, (r) => editJson(r, 'data/exams.json', (m) => { m.exams = []; })],
  ['só 7 domínios', /esperava 8 domínios, achei 7/, (r) => editJson(r, 'data/exams.json', (m) => { delete m.domains[8]; })],
  ['pesos que não somam 100', /pesos dos domínios somam/, (r) => editJson(r, 'data/exams.json', (m) => { m.domains[1].weight = 40; })],
  ['arquivo do simulado ausente', /arquivo ausente: data\/exams\/DIA1-SIM1\.json/, (r) => remove(r, 'data/exams/DIA1-SIM1.json')],
  ['id diferente do manifesto', /id diferente do manifesto/, (r) => editJson(r, 'data/exams/DIA1-SIM1.json', (e) => { e.id = 'DIA9-SIM9'; })],
  ['total diferente do manifesto', /total 4 != manifesto 5/, (r) => editJson(r, 'data/exams.json', (m) => { m.exams[0].total = 5; })],
  ['contagem por domínio diferente', /domínio D2: 2 questões, manifesto diz 3/, (r) => editJson(r, 'data/exams.json', (m) => { m.exams[0].domains['2'] = 3; })],
  ['numeração fora de ordem', /numeração fora de ordem/, (r) => editJson(r, 'data/exams/DIA1-SIM1.json', (e) => { e.questions[1].num = 7; })],
  ['domínio inválido', /domínio inválido: 9/, (r) => editJson(r, 'data/exams/DIA1-SIM1.json', (e) => { e.questions[0].domain = 9; })],
  ['dificuldade inválida', /dificuldade inválida/, (r) => editJson(r, 'data/exams/DIA1-SIM1.json', (e) => { e.questions[0].difficulty = 'insane'; })],
  ['sem resposta', /sem resposta/, (r) => editJson(r, 'data/exams/DIA1-SIM1.json', (e) => { e.questions[0].answer = []; })],
  ['n diferente do nº de respostas', /n \(2\) != respostas \(1\)/, (r) => editJson(r, 'data/exams/DIA1-SIM1.json', (e) => { e.questions[0].n = 2; })],
  ['enunciado ausente', /pt: stem\/explanation ausente/, (r) => editJson(r, 'data/exams/DIA1-SIM1.json', (e) => { e.questions[0].pt.stem = ''; })],
  ['explicação ausente', /en: stem\/explanation ausente/, (r) => editJson(r, 'data/exams/DIA1-SIM1.json', (e) => { delete e.questions[0].en.explanation; })],
  ['5 opções em resposta única', /5 opções, esperado 4/, (r) => editJson(r, 'data/exams/DIA1-SIM1.json', (e) => { e.questions[0].pt.options.push('Opção E'); })],
  ['opção vazia', /opção vazia/, (r) => editJson(r, 'data/exams/DIA1-SIM1.json', (e) => { e.questions[0].en.options[2] = '  '; })],
  ['marcador « » sobrando', /marcador «» sobrando/, (r) => editJson(r, 'data/exams/DIA1-SIM1.json', (e) => { e.questions[0].pt.explanation = 'Veja «A» e «B».'; })],
  ['índice de resposta fora do intervalo', /índice de resposta fora do intervalo/, (r) => editJson(r, 'data/exams/DIA1-SIM1.json', (e) => { e.questions[0].answer = [4]; })],
  ['respostas repetidas', /respostas repetidas/, (r) => editJson(r, 'data/exams/DIA1-SIM1.json', (e) => { Object.assign(e.questions[0], { n: 2, answer: [0, 0] }); e.questions[0].pt.options.push('E'); e.questions[0].en.options.push('E'); })],
  ['source inválida', /source inválida/, (r) => editJson(r, 'data/exams/DIA1-SIM1.json', (e) => { e.questions[0].source = 'docs/x'; })],
  ['verified fora do formato AAAA-MM', /verified deve ser AAAA-MM/, (r) => editJson(r, 'data/exams/DIA1-SIM1.json', (e) => { e.questions[0].verified = '2026-13'; })],
  ['PDF referenciado ausente', /PDF ausente \(pt_prova\)/, (r) => remove(r, 'pdfs/dia1/sim1/prova.pdf')],
  ['arquivo de dados órfão', /DIA7-SIM7\.json não está no manifesto/, (r) => write(r, 'data/exams/DIA7-SIM7.json', '{}')],
  ['enunciado repetido entre simulados', /enunciado duplicado de DIA1-SIM1 Q1/, (r) => writeExam(r, 'DIA1-SIM2', [question(1, 1, 'Primeira')])],
  ['index.html referencia arquivo inexistente', /referencia arquivo inexistente \(href\): assets\/style\/main\.css/, (r) => remove(r, 'assets/style/main.css')],
  ['index.html sem viewport', /index\.html sem name="viewport"/, (r) => editText(r, 'index.html', (s) => s.replace('name="viewport"', 'name="vp"'))],
  ['index.html sem apple-touch-icon', /sem apple-touch-icon/, (r) => editText(r, 'index.html', (s) => s.replace('rel="apple-touch-icon"', 'rel="icon"'))],
  ['index.html sem link do manifesto', /sem link para manifest\.webmanifest/, (r) => editText(r, 'index.html', (s) => s.replace('rel="manifest"', 'rel="foo"'))],
  ['og:image aponta para arquivo inexistente', /og:image\/twitter:image aponta para arquivo inexistente: docs\/screenshots\/share\.png/, (r) => remove(r, 'docs/screenshots/share.png')],
  ['sem og:image do próprio site', /sem og:image apontando para o próprio site/, (r) => editText(r, 'index.html', (s) => s.replace(/<meta property="(og|twitter):image"[^>]*>/g, ''))],
  ['manifesto PWA sem display válido', /display deve ser standalone/, (r) => editJson(r, 'manifest.webmanifest', (m) => { m.display = 'browser'; })],
  ['manifesto PWA sem name', /manifest\.webmanifest sem "name"/, (r) => editJson(r, 'manifest.webmanifest', (m) => { delete m.name; })],
  ['ícone com data: URI', /data: URI não é aceito/, (r) => editJson(r, 'manifest.webmanifest', (m) => { m.icons[0].src = 'data:image/png;base64,AAAA'; })],
  ['ícone inexistente', /ícone inexistente: assets\/icons\/icon-192\.png/, (r) => remove(r, 'assets/icons/icon-192.png')],
  ['ícone com tamanho real diferente do declarado', /declara 192x192 mas o arquivo tem 100x100/, (r) => write(r, 'assets/icons/icon-192.png', png(100, 100))],
  ['ícone que não é PNG', /não é um PNG válido/, (r) => write(r, 'assets/icons/icon-192.png', 'isto não é um png de verdade, só texto')],
  ['sem ícone maskable 512', /sem ícone 512x512 \(maskable\)/, (r) => editJson(r, 'manifest.webmanifest', (m) => { m.icons.pop(); })],
  ['sw.js ausente', /sw\.js ausente/, (r) => remove(r, 'sw.js')],
];
for (const [name, expected, mutate] of dataDefects) {
  test(`validate-data: detecta ${name}`, () => {
    const root = makeRepo();
    mutate(root);
    fails(run('validate-data.mjs', root), expected);
  });
}

test('validate-data: um defeito não esconde os outros (todos os problemas são listados)', () => {
  const root = makeRepo();
  remove(root, 'pdfs/dia1/sim1/prova.pdf');
  remove(root, 'assets/style/main.css');
  const result = run('validate-data.mjs', root);
  fails(result, /2 problema\(s\)/);
  assert.match(result.out, /PDF ausente/);
  assert.match(result.out, /main\.css/);
});

test('validate-data: PDFs são opcionais (simulado só para o site passa)', () => {
  const root = makeRepo();
  editJson(root, 'data/exams.json', (m) => { delete m.exams[0].pdfs; });
  remove(root, 'pdfs/dia1/sim1/prova.pdf');
  ok(run('validate-data.mjs', root));
});

// ---------- teste de viés de tamanho ----------
function biasedRepo(shape) {
  const root = makeRepo();
  const questions = Array.from({ length: 10 }, (_, i) => question(i + 1, 1 + (i % 2), `Questão de viés ${i}`));
  for (const q of questions) shape(q);
  remove(root, 'data/exams/DIA1-SIM1.json');
  editJson(root, 'data/exams.json', (m) => { m.exams = []; });
  writeExam(root, 'DIA1-SIM1', questions);
  return root;
}
const setLen = (q, index, text) => { for (const lang of ['pt', 'en']) q[lang].options[index] = text; };
const LONG = 'Uma alternativa bem mais comprida que todas as outras juntas';

test('viés de tamanho: 10 questões com alternativas equilibradas passam', () => {
  ok(run('validate-data.mjs', biasedRepo(() => {})));
});

test('viés de tamanho: correta sempre a MAIS LONGA é reprovada', () => {
  const root = biasedRepo((q) => setLen(q, 0, LONG));
  const result = run('validate-data.mjs', root);
  fails(result, /MAIS LONGA em 10\/10/);
  assert.match(result.out, /esperado entre 0\.90 e 1\.10/);
});

test('viés de tamanho: correta sempre a MAIS CURTA é reprovada', () => {
  fails(run('validate-data.mjs', biasedRepo((q) => { setLen(q, 0, 'A'); setLen(q, 1, 'Alternativa média longa'); })), /MAIS CURTA em 10\/10/);
});

test('viés de tamanho: tamanho médio da correta fora de 0.90–1.10 é reprovado mesmo sem ser a mais longa', () => {
  // correta um pouco maior (ratio > 1.10) mas há uma errada ainda maior: não é "a mais longa"
  const root = biasedRepo((q) => { setLen(q, 0, 'Opção A com um bom tamanho extra'); setLen(q, 1, 'Opção B com um tamanho ainda maior que a A'); });
  fails(run('validate-data.mjs', root), /tamanho médio da correta = 1\.\d\dx/);
});

test('viés de tamanho: abaixo de 8 questões de resposta única o teste não se aplica', () => {
  const root = makeRepo();
  editJson(root, 'data/exams/DIA1-SIM1.json', (e) => { for (const q of e.questions) setLen(q, 0, LONG); });
  ok(run('validate-data.mjs', root));
});

test('viés de tamanho: múltipla resposta com as corretas sempre mais longas é reprovada', () => {
  const root = makeRepo();
  const questions = Array.from({ length: 8 }, (_, i) => {
    const q = question(i + 1, 1, `Múltipla ${i}`, { n: 2, answer: [0, 1] });
    for (const lang of ['pt', 'en']) { q[lang].options = [LONG, LONG + ' demais', 'curta', 'curta 2', 'curta 3']; }
    return q;
  });
  remove(root, 'data/exams/DIA1-SIM1.json');
  editJson(root, 'data/exams.json', (m) => { m.exams = []; });
  writeExam(root, 'DIA1-SIM1', questions);
  const result = run('validate-data.mjs', root);
  fails(result, /as corretas são mais longas que as erradas \(100%/);
  assert.match(result.out, /múltipla resposta: corretas = \d+\.\d\dx/);
});

// ======================= check-js =======================
test('check-js: código válido passa e conta os arquivos', () => {
  const result = run('check-js.mjs', makeRepo());
  ok(result);
  assert.match(result.out, /sintaxe OK em 4 arquivo/);
});

test('check-js: erro de sintaxe em assets/js reprova e aponta o arquivo', () => {
  const root = makeRepo();
  write(root, 'assets/js/quebrado.js', 'export const = ;\n');
  fails(run('check-js.mjs', root), /quebrado\.js/);
});

test('check-js: erro de sintaxe em scripts/ também reprova', () => {
  const root = makeRepo();
  write(root, 'scripts/ruim.mjs', 'const a = {;\n');
  fails(run('check-js.mjs', root), /ruim\.mjs/);
});

test('check-js: lista TODOS os arquivos quebrados, não só o primeiro', () => {
  const root = makeRepo();
  write(root, 'assets/js/a1.js', '(\n');
  write(root, 'assets/js/a2.js', ')\n');
  const result = run('check-js.mjs', root);
  fails(result, /a1\.js/);
  assert.match(result.out, /a2\.js/);
});

test('check-js: ignora arquivos que não são JS', () => {
  const root = makeRepo();
  write(root, 'assets/js/notas.txt', 'isto { não é js');
  ok(run('check-js.mjs', root));
});

// ======================= build =======================
test('build: gera _site com a estrutura esperada', () => {
  const root = builtRepo();
  for (const rel of ['index.html', 'sw.js', 'manifest.webmanifest', '.nojekyll', 'assets/js/main.js', 'data/exams.json', 'pdfs/dia1/sim1/prova.pdf', 'docs/screenshots/share.png']) {
    assert.ok(existsSync(join(root, '_site', rel)), `_site/${rel} deveria existir`);
  }
  assert.ok(!existsSync(join(root, '_site/scripts')), 'scripts/ não vai ao ar');
  assert.ok(!existsSync(join(root, '_site/tests')), 'tests/ não vai ao ar');
});

test('build: versiona todos os imports relativos entre módulos, sem tocar no código-fonte', () => {
  const root = builtRepo();
  const out = read(root, '_site/assets/js/main.js');
  assert.match(out, /from '\.\/util\.js\?v=abc1234'/);
  assert.match(out, /from '\.\.\/js\/other\.js\?v=abc1234'/);
  assert.match(read(root, 'assets/js/main.js'), /from '\.\/util\.js';/, 'o fonte permanece intacto');
});

test('build: versiona CSS, JS, ícones e manifesto no index.html (não duplica o ?v= ao rodar de novo)', () => {
  const root = builtRepo();
  const html = read(root, '_site/index.html');
  for (const ref of ['assets/style/main.css', 'assets/js/main.js', 'assets/icons/apple-touch-icon.png', 'manifest.webmanifest']) {
    assert.ok(html.includes(`"${ref}?v=abc1234"`), ref);
  }
  ok(run('build.mjs', root)); // segunda execução: build limpo, mesmo resultado
  assert.equal(read(root, '_site/index.html'), html);
  assert.ok(!read(root, '_site/assets/js/main.js').includes('?v=abc1234?v='));
});

test('build: grava a versão e a lista de pré-cache no sw.js (sem PDFs, docs nem o próprio sw.js)', () => {
  const root = builtRepo();
  const sw = read(root, '_site/sw.js');
  assert.match(sw, /const CACHE_VERSION = 'abc1234';/);
  const precache = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);
  assert.equal(precache[0], './');
  for (const expected of ['./index.html', './manifest.webmanifest', './assets/js/util.js', './data/exams.json', './assets/icons/icon-512.png']) assert.ok(precache.includes(expected), expected);
  for (const entry of precache) {
    assert.ok(!entry.startsWith('./pdfs/') && !entry.startsWith('./docs/') && entry !== './sw.js', `não deveria listar ${entry}`);
  }
  assert.deepEqual(precache.slice(1), [...precache.slice(1)].sort(), 'lista ordenada (build reprodutível)');
  assert.match(read(root, 'sw.js'), /const CACHE_VERSION = 'dev';/, 'o sw.js do repositório permanece intacto');
});

test('build: é limpo — sobras de um build anterior não vão ao ar', () => {
  const root = makeRepo();
  write(root, '_site/lixo-antigo.txt', 'velho');
  ok(run('build.mjs', root));
  assert.ok(!existsSync(join(root, '_site/lixo-antigo.txt')));
});

test('build: falha se a imagem de compartilhamento não existe no repositório', () => {
  const root = makeRepo();
  remove(root, 'docs/screenshots/share.png');
  fails(run('build.mjs', root), /Imagem de compartilhamento ausente no repositório: docs\/screenshots\/share\.png/);
});

test('build: sem CCDV_HASH e sem git usa o hash "dev" (e avisa)', () => {
  const root = makeRepo();
  const result = run('build.mjs', root, { CCDV_HASH: '' });
  ok(result);
  assert.match(result.out, /hash: dev/);
  assert.match(read(root, '_site/sw.js'), /CACHE_VERSION = 'dev'/);
});

// ======================= verify-build =======================
test('verify-build: _site gerado pelo build passa', () => {
  const result = run('verify-build.mjs', builtRepo());
  ok(result);
  assert.match(result.out, /versão abc1234, 3 módulos versionados/);
});

test('verify-build: sem _site pede para rodar o build', () => {
  fails(run('verify-build.mjs', makeRepo()), /_site\/ não existe/);
});

const siteDefects = [
  ['import sem ?v=', /main\.js: import "\.\/util\.js" sem \?v=abc1234/, (r) => editText(r, '_site/assets/js/main.js', (s) => s.replace("./util.js?v=abc1234", './util.js'))],
  ['import com versão de outro build', /import "\.\/util\.js\?v=old9999" sem \?v=abc1234/, (r) => editText(r, '_site/assets/js/main.js', (s) => s.replace('?v=abc1234', '?v=old9999'))],
  ['import de módulo inexistente', /import inexistente "\.\/util\.js\?v=abc1234"/, (r) => remove(r, '_site/assets/js/util.js')],
  ['asset do index.html sem versão', /index\.html: "assets\/style\/main\.css" sem \?v=abc1234/, (r) => editText(r, '_site/index.html', (s) => s.replace('main.css?v=abc1234', 'main.css'))],
  ['index.html referencia arquivo que não existe no site', /index\.html referencia arquivo inexistente: assets\/style\/main\.css\?v=abc1234/, (r) => remove(r, '_site/assets/style/main.css')],
  ['sw.js sem CACHE_VERSION', /sw\.js sem CACHE_VERSION/, (r) => editText(r, '_site/sw.js', (s) => s.replace(/const CACHE_VERSION = '[^']*';/, ''))],
  ['PRECACHE ilegível', /PRECACHE ilegível/, (r) => editText(r, '_site/sw.js', (s) => s.replace(/const PRECACHE = \[[\s\S]*?\];/, 'const PRECACHE = [oops];'))],
  ['PRECACHE sem um módulo JS', /PRECACHE não inclui o módulo \.\/assets\/js\/util\.js/, (r) => editText(r, '_site/sw.js', (s) => s.replace('  "./assets/js/util.js",\n', ''))],
  ['PRECACHE sem o manifesto de simulados', /PRECACHE sem \.\/data\/exams\.json/, (r) => editText(r, '_site/sw.js', (s) => s.replace('  "./data/exams.json",\n', ''))],
  ['PRECACHE lista arquivo inexistente', /PRECACHE lista arquivo inexistente: \.\/assets\/fantasma\.js/, (r) => editText(r, '_site/sw.js', (s) => s.replace('"./index.html",', '"./index.html",\n  "./assets/fantasma.js",'))],
  ['PRECACHE incluindo PDF', /PRECACHE não deve incluir PDFs/, (r) => editText(r, '_site/sw.js', (s) => s.replace('"./index.html",', '"./index.html",\n  "./pdfs/dia1/sim1/prova.pdf",'))],
  ['PRECACHE quase vazio', /PRECACHE com apenas 1 item/, (r) => editText(r, '_site/sw.js', (s) => s.replace(/const PRECACHE = \[[\s\S]*?\];/, 'const PRECACHE = ["./"];'))],
  ['imagem de compartilhamento fora do site', /og:image\/twitter:image aponta para arquivo que não vai ao ar: docs\/screenshots\/share\.png/, (r) => remove(r, '_site/docs')],
];
for (const [name, expected, mutate] of siteDefects) {
  test(`verify-build: detecta ${name}`, () => {
    const root = builtRepo();
    mutate(root);
    fails(run('verify-build.mjs', root), expected);
  });
}

// ======================= site-paths =======================
test('site-paths: metaContent lê meta e link, em qualquer ordem de atributos; ausente => null', () => {
  const html = '<meta content="https://a/b.png" property="og:image"><link rel="canonical" href="https://a/">';
  assert.equal(metaContent(html, 'property', 'og:image'), 'https://a/b.png');
  assert.equal(metaContent(html, 'rel', 'canonical'), 'https://a/');
  assert.equal(metaContent(html, 'property', 'og:title'), null);
});

test('site-paths: localPathOf converte URL pública em caminho local; fora da base => null', () => {
  assert.equal(localPathOf(`${BASE}docs/screenshots/a.png`, BASE), 'docs/screenshots/a.png');
  assert.equal(localPathOf('https://outro.site/x.png', BASE), null);
});

test('site-paths: shareImagePaths devolve só imagens do próprio site; sem canonical => vazio', () => {
  const html = `<link rel="canonical" href="${BASE}"><meta property="og:image" content="${BASE}a.png"><meta property="twitter:image" content="https://cdn.externo/b.png">`;
  assert.deepEqual(shareImagePaths(html), ['a.png']);
  assert.deepEqual(shareImagePaths('<meta property="og:image" content="https://x/a.png">'), []);
  assert.deepEqual(shareImagePaths(''), []);
});

test('fixture base: contém só o necessário (nada de _site/ de execuções anteriores)', () => {
  const root = makeRepo();
  assert.deepEqual(readdirSync(root).sort(), ['assets', 'data', 'docs', 'index.html', 'manifest.webmanifest', 'package.json', 'pdfs', 'scripts', 'sw.js']);
});
