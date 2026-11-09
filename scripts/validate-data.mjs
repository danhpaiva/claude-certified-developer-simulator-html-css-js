// Valida os dados do simulador sem dependências externas.
// Falha (exit 1) se manifesto, simulados, PDFs ou referências do index.html estiverem inconsistentes.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const fail = (msg) => errors.push(msg);
const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

// ---------- manifesto ----------
const manifest = readJson('data/exams.json');
if (!manifest.exams?.length) fail('manifesto sem simulados');
const domainIds = Object.keys(manifest.domains || {});
if (domainIds.length !== 8) fail(`esperava 8 domínios, achei ${domainIds.length}`);
const weightSum = Object.values(manifest.domains || {}).reduce((s, d) => s + d.weight, 0);
if (Math.abs(weightSum - 100) > 0.11) fail(`pesos dos domínios somam ${weightSum.toFixed(1)}, esperado 100`);

// ---------- cada simulado ----------
const seenStems = new Map();
for (const entry of manifest.exams) {
  const where = `[${entry.id}]`;
  const file = `data/exams/${entry.id}.json`;
  if (!existsSync(join(root, file))) { fail(`${where} arquivo ausente: ${file}`); continue; }
  const exam = readJson(file);

  if (exam.id !== entry.id) fail(`${where} id diferente do manifesto (${exam.id})`);
  if (exam.questions.length !== entry.total) fail(`${where} total ${exam.questions.length} != manifesto ${entry.total}`);

  const perDomain = {};
  exam.questions.forEach((q, i) => {
    const w = `${where} Q${q.num}`;
    if (q.num !== i + 1) fail(`${w} numeração fora de ordem (posição ${i + 1})`);
    if (!domainIds.includes(String(q.domain))) fail(`${w} domínio inválido: ${q.domain}`);
    perDomain[q.domain] = (perDomain[q.domain] || 0) + 1;
    if (!['easy', 'medium', 'hard'].includes(q.difficulty)) fail(`${w} dificuldade inválida`);
    if (!Array.isArray(q.answer) || !q.answer.length) fail(`${w} sem resposta`);
    if (q.n !== q.answer.length) fail(`${w} n (${q.n}) != respostas (${q.answer.length})`);
    for (const lang of ['pt', 'en']) {
      const c = q[lang];
      if (!c?.stem || !c?.explanation) fail(`${w} ${lang}: stem/explanation ausente`);
      const expected = q.n === 1 ? 4 : 5;
      if (c?.options?.length !== expected) fail(`${w} ${lang}: ${c?.options?.length} opções, esperado ${expected}`);
      if (c?.options?.some((o) => !o || !o.trim())) fail(`${w} ${lang}: opção vazia`);
      if (/[«»]/.test(c?.explanation || '')) fail(`${w} ${lang}: marcador «» sobrando na explicação`);
    }
    if (q.pt.options.length !== q.en.options.length) fail(`${w} pt/en com nº de opções diferente`);
    if (q.answer.some((a) => a < 0 || a >= q.pt.options.length)) fail(`${w} índice de resposta fora do intervalo`);
    if (new Set(q.answer).size !== q.answer.length) fail(`${w} respostas repetidas`);
    if (!/^https?:\/\//.test(q.source || '')) fail(`${w} source inválida`);

    // anti-repetição: o mesmo enunciado não pode aparecer em dois simulados
    const key = q.en.stem.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seenStems.has(key)) fail(`${w} enunciado duplicado de ${seenStems.get(key)}`);
    else seenStems.set(key, `${exam.id} Q${q.num}`);
  });

  for (const [d, count] of Object.entries(entry.domains)) {
    if ((perDomain[d] || 0) !== count) fail(`${where} domínio D${d}: ${perDomain[d] || 0} questões, manifesto diz ${count}`);
  }

  // PDFs referenciados existem (campo opcional)
  if (entry.pdfs) {
    for (const [kind, path] of Object.entries(entry.pdfs)) {
      if (!existsSync(join(root, path))) fail(`${where} PDF ausente (${kind}): ${path}`);
    }
  }
}

// arquivos de dados órfãos (existem mas não estão no manifesto)
const listed = new Set(manifest.exams.map((e) => `${e.id}.json`));
for (const f of readdirSync(join(root, 'data/exams'))) {
  if (f.endsWith('.json') && !listed.has(f)) fail(`data/exams/${f} não está no manifesto`);
}

// ---------- referências locais do index.html ----------
const html = readFileSync(join(root, 'index.html'), 'utf8');
for (const [, attr, ref] of html.matchAll(/\b(href|src)="([^"#:]+)"/g)) {
  if (ref.startsWith('data') || ref.startsWith('//')) continue;
  // Manifesto e SW são verificados separadamente abaixo
  if (ref === 'manifest.webmanifest' || ref === './sw.js') continue;
  if (!existsSync(join(root, ref))) fail(`index.html referencia arquivo inexistente (${attr}): ${ref}`);
}

// Manifesto PWA e Service Worker
if (!existsSync(join(root, 'manifest.webmanifest'))) fail('manifest.webmanifest ausente');
if (!existsSync(join(root, 'sw.js'))) fail('sw.js ausente');
if (!html.includes('rel="manifest"')) fail('index.html sem link para manifest.webmanifest');

for (const required of ['<html lang=', 'name="viewport"', '<title>', 'id="app"', 'type="module"']) {
  if (!html.includes(required)) fail(`index.html sem ${required}`);
}

// ---------- resultado ----------
if (errors.length) {
  console.error(`✗ ${errors.length} problema(s):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
const total = manifest.exams.reduce((s, e) => s + e.total, 0);
console.log(`✓ ${manifest.exams.length} simulado(s), ${total} questões, PDFs e index.html consistentes.`);
