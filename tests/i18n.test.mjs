import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// setLang() escreve em document.documentElement.lang; basta um stub mínimo.
global.document = { documentElement: {} };
const { t, setLang } = await import('../assets/js/i18n.js');

const source = readFileSync(new URL('../assets/js/i18n.js', import.meta.url), 'utf8');

// Extrai as chaves de cada idioma direto do código-fonte (um objeto literal duplicado perderia a chave sem avisar).
function blockOf(lang) {
  const start = source.indexOf(`  ${lang}: {`);
  const end = source.indexOf('\n  },', start);
  return source.slice(start, end);
}
const keysOf = (lang) => [...blockOf(lang).matchAll(/^ {4}([A-Za-z0-9_]+)\s*:/gm)].map((m) => m[1]);

test('i18n: nenhuma chave duplicada em PT nem em EN', () => {
  for (const lang of ['pt', 'en']) {
    const keys = keysOf(lang);
    assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), [], `chaves duplicadas em ${lang}`);
  }
});

test('i18n: PT e EN têm exatamente as mesmas chaves', () => {
  const pt = new Set(keysOf('pt'));
  const en = new Set(keysOf('en'));
  assert.deepEqual([...pt].filter((k) => !en.has(k)), [], 'só em PT');
  assert.deepEqual([...en].filter((k) => !pt.has(k)), [], 'só em EN');
});

test('i18n: sem objetos aninhados (t() só resolve chaves planas)', () => {
  assert.equal(/^ {4}[A-Za-z0-9_]+:\s*\{/m.test(source), false);
});

test('i18n: toda chave usada literalmente em t(...) e data-i18n existe nos dois idiomas', () => {
  const dir = new URL('../assets/js/', import.meta.url);
  const used = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const code = readFileSync(new URL(file, dir), 'utf8');
    for (const m of code.matchAll(/\bt\('([A-Za-z0-9_]+)'/g)) used.add(m[1]);
  }
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const m of html.matchAll(/data-i18n(?:-label)?="([A-Za-z0-9_]+)"/g)) used.add(m[1]);
  const pt = new Set(keysOf('pt'));
  const en = new Set(keysOf('en'));
  const missing = [...used].filter((k) => !pt.has(k) || !en.has(k));
  assert.deepEqual(missing, [], 'chaves usadas e inexistentes');
});

test('t(): "resume" mantém o modo e o cronômetro usa outra chave (regressão da chave duplicada)', () => {
  setLang('pt');
  assert.match(t('resume', { mode: 'prova' }), /prova/);
  assert.equal(t('resumeTimer'), 'Retomar');
  setLang('en');
  assert.match(t('resume', { mode: 'exam' }), /exam/);
  assert.equal(t('resumeTimer'), 'Resume');
});

test('t(): ajuda de atalhos resolve para texto (regressão das chaves cruas)', () => {
  for (const lang of ['pt', 'en']) {
    setLang(lang);
    for (const key of ['helpKeyHelp', 'helpKeyLang', 'helpKeyTheme', 'helpKeyNav', 'helpKeyOptions', 'helpKeyFlag']) {
      assert.notEqual(t(key), key, `${lang}:${key} sem tradução`);
    }
  }
});

test('t(): interpola variáveis', () => {
  setLang('en');
  assert.equal(t('weakItem', { avg: '40%', weight: '33.1', lost: '19.9' }).includes('33.1'), true);
});
