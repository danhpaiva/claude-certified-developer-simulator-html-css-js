// Build do site para deploy: monta _site/ sem tocar no código-fonte.
//  1. copia só o que vai ao ar (inclusive a imagem de compartilhamento do og:image);
//  2. cache-busting completo: ?v=<hash do commit> no HTML, no CSS, no manifesto e em TODOS os imports entre módulos JS;
//  3. gera a lista de pré-cache do service worker a partir dos arquivos reais e grava a versão do cache.
import { readFileSync, writeFileSync, cpSync, mkdirSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { shareImagePaths } from './site-paths.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = join(root, '_site');

let hash = 'dev';
try {
  hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch {
  console.warn('⚠ Git não disponível, usando hash "dev"');
}
console.log(`Build para deploy (hash: ${hash})`);

// Build limpo: sem sobras de execuções anteriores
rmSync(siteDir, { recursive: true, force: true });
mkdirSync(siteDir, { recursive: true });

// ---------- 1. cópia ----------
for (const dir of ['assets', 'data', 'pdfs']) cpSync(join(root, dir), join(siteDir, dir), { recursive: true });
cpSync(join(root, 'manifest.webmanifest'), join(siteDir, 'manifest.webmanifest'));
writeFileSync(join(siteDir, '.nojekyll'), '');

const sourceHtml = readFileSync(join(root, 'index.html'), 'utf8');
for (const rel of shareImagePaths(sourceHtml)) {
  const from = join(root, rel);
  if (!existsSync(from)) throw new Error(`Imagem de compartilhamento ausente no repositório: ${rel}`);
  mkdirSync(dirname(join(siteDir, rel)), { recursive: true });
  cpSync(from, join(siteDir, rel));
  console.log(`  imagem de compartilhamento: ${rel}`);
}

// ---------- 2. cache-busting ----------
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

// imports relativos entre módulos: './x.js' -> './x.js?v=hash' (sem isso só o main.js seria versionado)
let rewritten = 0;
for (const file of walk(join(siteDir, 'assets/js')).filter((f) => f.endsWith('.js'))) {
  const code = readFileSync(file, 'utf8');
  const out = code.replace(/(\bfrom\s+['"])(\.{1,2}\/[^'"?]+\.js)(['"])/g, (all, a, path, c) => {
    rewritten += 1;
    return `${a}${path}?v=${hash}${c}`;
  });
  if (out !== code) writeFileSync(file, out);
}

const html = sourceHtml
  .replace(/\b(href|src)="(assets\/[^"?]+)"/g, `$1="$2?v=${hash}"`) // CSS, JS e ícones
  .replace(/href="(manifest\.webmanifest)"/g, `href="$1?v=${hash}"`);
writeFileSync(join(siteDir, 'index.html'), html);

// ---------- 3. service worker ----------
// Pré-cache: tudo que o site precisa para abrir offline (PDFs ficam de fora: são guardados quando abertos).
const precache = walk(siteDir)
  .map((f) => relative(siteDir, f).split(sep).join('/'))
  .filter((f) => !f.startsWith('pdfs/') && !f.startsWith('docs/') && f !== 'sw.js' && f !== '.nojekyll')
  .sort()
  .map((f) => `./${f}`);
precache.unshift('./');

let sw = readFileSync(join(root, 'sw.js'), 'utf8');
sw = sw.replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = '${hash}';`);
sw = sw.replace(
  /\/\/ BUILD:PRECACHE_START[\s\S]*?\/\/ BUILD:PRECACHE_END/,
  `// BUILD:PRECACHE_START\nconst PRECACHE = ${JSON.stringify(precache, null, 2)};\n// BUILD:PRECACHE_END`,
);
writeFileSync(join(siteDir, 'sw.js'), sw);

console.log(`Build concluído: _site/ pronto para deploy.`);
console.log(`  - versão do cache: ${hash}`);
console.log(`  - imports de módulos versionados: ${rewritten}`);
console.log(`  - arquivos no pré-cache offline: ${precache.length}`);
