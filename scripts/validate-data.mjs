// Valida os dados do simulador sem dependências externas.
// Falha (exit 1) se manifesto, simulados, PDFs ou referências do index.html estiverem inconsistentes.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shareImagePaths } from './site-paths.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

// Limites do teste de viés de tamanho das alternativas (só vale para simulados com questões suficientes).
const MIN_FOR_BIAS_CHECK = 8;
const MAX_EXTREME_SHARE = 0.4; // correta como a mais longa (ou a mais curta) em no máximo 40% das questões de resposta única
const MAX_MULTI_LONGER_SHARE = 0.65;
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
    if (q.verified !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(q.verified)) fail(`${w} verified deve ser AAAA-MM`);

    // anti-repetição: o mesmo enunciado não pode aparecer em dois simulados
    const key = q.en.stem.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seenStems.has(key)) fail(`${w} enunciado duplicado de ${seenStems.get(key)}`);
    else seenStems.set(key, `${exam.id} Q${q.num}`);
  });

  // ---------- viés de tamanho: o tamanho da alternativa não pode entregar a resposta ----------
  // Resposta única: a correta não pode ser (quase) sempre a mais longa nem a mais curta.
  // Múltipla resposta: as corretas não podem ser (quase) sempre mais longas que as erradas.
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  for (const lang of ['pt', 'en']) {
    const singles = exam.questions.filter((q) => q.n === 1);
    const multis = exam.questions.filter((q) => q.n > 1);
    if (singles.length >= MIN_FOR_BIAS_CHECK) {
      const lens = (q) => q[lang].options.map((o) => o.length);
      const longest = singles.filter((q) => lens(q)[q.answer[0]] === Math.max(...lens(q)) && lens(q).filter((x) => x === Math.max(...lens(q))).length === 1).length;
      const shortest = singles.filter((q) => lens(q)[q.answer[0]] === Math.min(...lens(q)) && lens(q).filter((x) => x === Math.min(...lens(q))).length === 1).length;
      const ratio = mean(singles.map((q) => lens(q)[q.answer[0]] / mean(lens(q))));
      if (longest / singles.length > MAX_EXTREME_SHARE) fail(`${where} (${lang}): a alternativa correta é a MAIS LONGA em ${longest}/${singles.length} questões de resposta única (${Math.round((100 * longest) / singles.length)}%; máximo ${MAX_EXTREME_SHARE * 100}%)`);
      if (shortest / singles.length > MAX_EXTREME_SHARE) fail(`${where} (${lang}): a alternativa correta é a MAIS CURTA em ${shortest}/${singles.length} questões de resposta única (${Math.round((100 * shortest) / singles.length)}%; máximo ${MAX_EXTREME_SHARE * 100}%)`);
      if (ratio < 0.9 || ratio > 1.1) fail(`${where} (${lang}): tamanho médio da correta = ${ratio.toFixed(2)}x a média das alternativas (esperado entre 0.90 e 1.10)`);
    }
    if (multis.length >= MIN_FOR_BIAS_CHECK) {
      const lens = (q) => q[lang].options.map((o) => o.length);
      const split = (q) => [mean(q.answer.map((i) => lens(q)[i])), mean(lens(q).filter((_, i) => !q.answer.includes(i)))];
      const longer = multis.filter((q) => { const [c, w] = split(q); return c > w; }).length;
      const ratio = mean(multis.map((q) => { const [c, w] = split(q); return c / w; }));
      if (longer / multis.length > MAX_MULTI_LONGER_SHARE) fail(`${where} (${lang}): em ${longer}/${multis.length} questões de múltipla resposta as corretas são mais longas que as erradas (${Math.round((100 * longer) / multis.length)}%; máximo ${MAX_MULTI_LONGER_SHARE * 100}%)`);
      if (ratio < 0.85 || ratio > 1.15) fail(`${where} (${lang}): múltipla resposta: corretas = ${ratio.toFixed(2)}x o tamanho das erradas (esperado entre 0.85 e 1.15)`);
    }
  }

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

// ---------- manifesto PWA: ícones reais e instalabilidade ----------
const webmanifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
for (const key of ['name', 'short_name', 'start_url', 'display', 'theme_color', 'background_color']) {
  if (!webmanifest[key]) fail(`manifest.webmanifest sem "${key}"`);
}
if (!['standalone', 'fullscreen', 'minimal-ui'].includes(webmanifest.display)) fail('manifest: display deve ser standalone, fullscreen ou minimal-ui');
const icons = webmanifest.icons || [];
const pngSize = (file) => {
  const bytes = readFileSync(file);
  return bytes.toString('latin1', 1, 4) === 'PNG' ? [bytes.readUInt32BE(16), bytes.readUInt32BE(20)] : null;
};
for (const icon of icons) {
  if (!icon.src || icon.src.startsWith('data:')) { fail('manifest: ícone deve ser um arquivo (data: URI não é aceito para instalar)'); continue; }
  const file = join(root, icon.src);
  if (!existsSync(file)) { fail(`manifest: ícone inexistente: ${icon.src}`); continue; }
  const [w, h] = String(icon.sizes).split('x').map(Number);
  const real = pngSize(file);
  if (!real) fail(`manifest: ${icon.src} não é um PNG válido`);
  else if (real[0] !== w || real[1] !== h) fail(`manifest: ${icon.src} declara ${icon.sizes} mas o arquivo tem ${real[0]}x${real[1]}`);
}
for (const [size, purpose] of [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]) {
  if (!icons.some((i) => i.sizes === size && i.purpose === purpose)) fail(`manifest sem ícone ${size} (${purpose})`);
}
if (!html.includes('rel="apple-touch-icon"')) fail('index.html sem apple-touch-icon');

// A imagem de compartilhamento (og:image/twitter:image) precisa existir; o build a copia para o site.
const shareImages = shareImagePaths(html);
if (!shareImages.length) fail('index.html sem og:image apontando para o próprio site');
for (const rel of shareImages) if (!existsSync(join(root, rel))) fail(`og:image/twitter:image aponta para arquivo inexistente: ${rel}`);

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
