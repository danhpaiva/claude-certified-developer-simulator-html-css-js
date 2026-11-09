// Confere o _site/ gerado por `npm run build`: o que o navegador vai pedir precisa existir e ser coerente.
// Roda no CI e no deploy, antes de publicar.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shareImagePaths } from './site-paths.mjs';

const site = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), '_site');
const errors = [];
const fail = (msg) => errors.push(msg);
if (!existsSync(site)) {
  console.error('✗ _site/ não existe. Rode `npm run build` antes.');
  process.exit(1);
}
const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
const stripQuery = (ref) => ref.split('?')[0];

// ---------- versão ----------
const sw = readFileSync(join(site, 'sw.js'), 'utf8');
const version = sw.match(/const CACHE_VERSION = '([^']*)';/)?.[1];
if (!version) fail('sw.js sem CACHE_VERSION');
const html = readFileSync(join(site, 'index.html'), 'utf8');

// ---------- index.html: tudo versionado com a mesma versão e existente ----------
const assetRefs = [...html.matchAll(/\b(?:href|src)="((?:assets\/|manifest\.webmanifest)[^"]*)"/g)].map((m) => m[1]);
if (!assetRefs.length) fail('index.html sem referências a assets');
for (const ref of assetRefs) {
  if (!ref.includes(`?v=${version}`)) fail(`index.html: "${ref}" sem ?v=${version}`);
  if (!existsSync(join(site, stripQuery(ref)))) fail(`index.html referencia arquivo inexistente: ${ref}`);
}

// ---------- módulos JS: todo import relativo versionado e existente ----------
const jsFiles = walk(join(site, 'assets/js')).filter((f) => f.endsWith('.js'));
for (const file of jsFiles) {
  const code = readFileSync(file, 'utf8');
  for (const [, , spec] of code.matchAll(/\bfrom\s+(['"])(\.{1,2}\/[^'"]+)\1/g)) {
    if (!spec.endsWith(`?v=${version}`)) fail(`${file.slice(site.length + 1)}: import "${spec}" sem ?v=${version}`);
    if (!existsSync(join(dirname(file), stripQuery(spec)))) fail(`${file.slice(site.length + 1)}: import inexistente "${spec}"`);
  }
}

// ---------- service worker: pré-cache real e completo ----------
let precache = [];
try {
  precache = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);
} catch {
  fail('sw.js: PRECACHE ilegível');
}
if (precache.length < 5) fail(`sw.js: PRECACHE com apenas ${precache.length} item(ns)`);
for (const entry of precache) {
  const rel = entry === './' ? 'index.html' : entry.replace(/^\.\//, '');
  if (!existsSync(join(site, rel))) fail(`PRECACHE lista arquivo inexistente: ${entry}`);
  if (rel.startsWith('pdfs/')) fail(`PRECACHE não deve incluir PDFs: ${entry}`);
}
const listed = new Set(precache);
for (const file of jsFiles) {
  const entry = './' + file.slice(site.length + 1).split('\\').join('/');
  if (!listed.has(entry)) fail(`PRECACHE não inclui o módulo ${entry} (o site não abriria offline)`);
}
for (const required of ['./', './index.html', './manifest.webmanifest', './assets/style/main.css', './data/exams.json']) {
  if (!listed.has(required)) fail(`PRECACHE sem ${required}`);
}

// ---------- imagem de compartilhamento ----------
const images = shareImagePaths(html);
if (!images.length) fail('index.html sem og:image/twitter:image apontando para o próprio site');
for (const rel of images) if (!existsSync(join(site, rel))) fail(`og:image/twitter:image aponta para arquivo que não vai ao ar: ${rel}`);

if (errors.length) {
  console.error(`✗ ${errors.length} problema(s) no _site/:`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`✓ _site/ coerente: versão ${version}, ${jsFiles.length} módulos versionados, ${precache.length} itens no pré-cache, ${images.length} imagem(ns) de compartilhamento.`);
