// Checa a sintaxe de todos os módulos JS (node --check) sem instalar nada.
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// CCDV_ROOT permite apontar o script para outra pasta (usado nos testes dos validadores).
const root = process.env.CCDV_ROOT ? resolve(process.env.CCDV_ROOT) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.js') || name.endsWith('.mjs')) files.push(full);
  }
};
walk(join(root, 'assets/js'));
walk(join(root, 'scripts'));

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed += 1;
    console.error(`✗ ${file}\n${result.stderr}`);
  }
}
if (failed) process.exit(1);
console.log(`✓ sintaxe OK em ${files.length} arquivo(s) JS.`);
