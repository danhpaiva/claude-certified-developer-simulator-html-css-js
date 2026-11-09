// Build script: adiciona cache-busting (query string com hash do commit) aos imports e links.
// Roda no deploy, modifica arquivos na pasta _site/ sem tocar no código-fonte.
import { readFileSync, writeFileSync, cpSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = join(root, '_site');

// Obtém o hash curto do commit atual
let hash = 'dev';
try {
  hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch {
  console.warn('⚠ Git não disponível, usando hash "dev"');
}

console.log(`🔨 Build para deploy (hash: ${hash})`);

// Cria a pasta _site
mkdirSync(siteDir, { recursive: true });

// Copia os arquivos necessários
console.log('📦 Copiando arquivos...');
cpSync(join(root, 'assets'), join(siteDir, 'assets'), { recursive: true });
cpSync(join(root, 'data'), join(siteDir, 'data'), { recursive: true });
cpSync(join(root, 'pdfs'), join(siteDir, 'pdfs'), { recursive: true });
cpSync(join(root, 'manifest.webmanifest'), join(siteDir, 'manifest.webmanifest'));
writeFileSync(join(siteDir, '.nojekyll'), '');

// Processa o index.html adicionando query strings
console.log('🔧 Adicionando cache-busting ao index.html...');
let html = readFileSync(join(root, 'index.html'), 'utf8');

// Adiciona ?v=<hash> aos imports de JS e CSS
html = html.replace(/href="(assets\/[^"]+\.css)"/g, `href="$1?v=${hash}"`);
html = html.replace(/src="(assets\/js\/[^"]+\.js)"/g, `src="$1?v=${hash}"`);
html = html.replace(/href="(manifest\.webmanifest)"/g, `href="$1?v=${hash}"`);

writeFileSync(join(siteDir, 'index.html'), html);

// Processa o service worker adicionando a versão
console.log('🔧 Atualizando versão do cache no service worker...');
let sw = readFileSync(join(root, 'sw.js'), 'utf8');
sw = sw.replace(/const CACHE_VERSION = '[^']+';/, `const CACHE_VERSION = '${hash}';`);
writeFileSync(join(siteDir, 'sw.js'), sw);

console.log('✅ Build concluído! Pasta _site/ pronta para deploy.');
console.log(`   - Cache version: ${hash}`);
console.log(`   - Assets com query string: ?v=${hash}`);
