import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
// Blob e File ficam os do Node (o jsdom não implementa .text()), como no navegador.

const { h, mount, clear, formatTime, downloadJson, uploadJson } = await import('../assets/js/dom.js');

beforeEach(() => { document.body.replaceChildren(); });
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- h ----------
test('h: cria o elemento com atributos, classe e filhos', () => {
  const el = h('a', { class: 'btn big', href: '#/x', 'data-id': 7 }, 'oi');
  assert.equal(el.tagName, 'A');
  assert.equal(el.className, 'btn big');
  assert.equal(el.getAttribute('href'), '#/x');
  assert.equal(el.getAttribute('data-id'), '7');
  assert.equal(el.textContent, 'oi');
});

test('h: atributos false/null/undefined não são escritos; true vira atributo vazio', () => {
  const el = h('button', { disabled: true, hidden: false, title: null, lang: undefined });
  assert.equal(el.getAttribute('disabled'), '');
  for (const name of ['hidden', 'title', 'lang']) assert.equal(el.hasAttribute(name), false, name);
});

test('h: onXxx com função vira listener; com valor que não é função vira atributo comum', () => {
  let clicks = 0;
  const el = h('button', { onclick: () => { clicks += 1; } });
  el.click();
  el.click();
  assert.equal(clicks, 2);
  assert.equal(el.hasAttribute('onclick'), false);
  assert.equal(h('div', { onfoo: 'texto' }).getAttribute('onfoo'), 'texto');
});

test('h: sem atributos (undefined ou null) funciona', () => {
  assert.equal(h('p').outerHTML, '<p></p>');
  assert.equal(h('p', null, 'x').outerHTML, '<p>x</p>');
});

test('h: filhos — achata arrays, ignora null/false/undefined, aceita números (inclusive 0) e nós', () => {
  const el = h('div', null, 'a', [null, ['b', false, [0]]], undefined, 5, h('i', null, 'c'));
  assert.equal(el.innerHTML, 'ab05<i>c</i>');
});

test('h: texto vira nó de texto, nunca HTML (sem injeção)', () => {
  const el = h('div', null, '<img src=x onerror=alert(1)>');
  assert.equal(el.children.length, 0);
  assert.equal(el.textContent, '<img src=x onerror=alert(1)>');
});

// ---------- mount / clear ----------
test('mount: acrescenta ao pai e devolve o próprio pai; ignora null/false (o append nativo escreveria "null")', () => {
  const parent = h('div', null, 'a');
  assert.equal(mount(parent, null, 'b', false, [h('b', null, 'c')]), parent);
  assert.equal(parent.innerHTML, 'ab<b>c</b>');
  assert.ok(!parent.textContent.includes('null') && !parent.textContent.includes('false'));
});

test('clear: remove todos os filhos e devolve o elemento', () => {
  const el = h('ul', null, h('li'), h('li'), 'texto');
  assert.equal(clear(el), el);
  assert.equal(el.childNodes.length, 0);
  clear(el); // já vazio: sem erro
});

// ---------- formatTime ----------
test('formatTime: MM:SS abaixo de 1 hora, H:MM:SS a partir dela', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(59_000), '00:59');
  assert.equal(formatTime(60_000), '01:00');
  assert.equal(formatTime(59 * 60_000 + 59_000), '59:59');
  assert.equal(formatTime(3_600_000), '1:00:00');
  assert.equal(formatTime(120 * 60_000), '2:00:00');
  assert.equal(formatTime(3_600_000 + 5 * 60_000 + 9_000), '1:05:09');
});

test('formatTime: arredonda ao segundo mais próximo', () => {
  assert.equal(formatTime(499), '00:00');
  assert.equal(formatTime(500), '00:01');
  assert.equal(formatTime(59_499), '00:59');
  assert.equal(formatTime(59_500), '01:00');
});

test('formatTime: negativo e valores inválidos viram 00:00 (nunca "NaN:NaN")', () => {
  for (const bad of [-1, -99_999, NaN, undefined, Infinity, 'abc']) {
    assert.equal(formatTime(bad), '00:00', String(bad));
  }
});

// ---------- downloadJson ----------
test('downloadJson: cria link com o nome certo, clica, remove o link e libera a URL depois', async () => {
  const created = [];
  const revoked = [];
  global.URL.createObjectURL = (blob) => { created.push(blob); return 'blob:fake-1'; };
  global.URL.revokeObjectURL = (url) => revoked.push(url);
  let clicked = null;
  const original = dom.window.HTMLAnchorElement.prototype.click;
  dom.window.HTMLAnchorElement.prototype.click = function () {
    clicked = { href: this.getAttribute('href'), download: this.getAttribute('download'), inDom: document.body.contains(this) };
  };
  try {
    downloadJson('historico.json', { a: 1, b: [2] });
  } finally {
    dom.window.HTMLAnchorElement.prototype.click = original;
  }
  assert.deepEqual(clicked, { href: 'blob:fake-1', download: 'historico.json', inDom: true });
  assert.equal(document.querySelector('a'), null, 'o link temporário não pode ficar na página');
  assert.equal(created.length, 1);
  assert.equal(created[0].type, 'application/json');
  assert.deepEqual(JSON.parse(await created[0].text()), { a: 1, b: [2] });
  assert.deepEqual(revoked, [], 'a URL só é liberada depois (o download precisa começar)');
  await tick(1100);
  assert.deepEqual(revoked, ['blob:fake-1']);
});

// ---------- uploadJson ----------
// O jsdom não deixa atribuir input.files: simulamos com defineProperty e disparamos "change".
async function pick(file) {
  const input = document.querySelector('input[type=file]');
  assert.ok(input, 'o seletor de arquivo deve estar na página');
  Object.defineProperty(input, 'files', { value: file ? [file] : [], configurable: true });
  input.dispatchEvent(new dom.window.Event('change'));
  await tick(5);
  return input;
}
const openPicker = (onData, onError) => {
  let opened = false;
  const original = dom.window.HTMLInputElement.prototype.click;
  dom.window.HTMLInputElement.prototype.click = function () { opened = true; };
  try { uploadJson(onData, onError); } finally { dom.window.HTMLInputElement.prototype.click = original; }
  assert.ok(opened, 'deve abrir o seletor');
};

test('uploadJson: aceita só JSON e entrega o conteúdo lido; remove o input depois', async () => {
  const got = [];
  openPicker((d) => got.push(d), (m) => assert.fail(m));
  const input = document.querySelector('input[type=file]');
  assert.match(input.getAttribute('accept'), /json/);
  await pick(new File(['{"x":[1,2]}'], 'a.json', { type: 'application/json' }));
  assert.deepEqual(got, [{ x: [1, 2] }]);
  assert.equal(document.querySelector('input[type=file]'), null);
});

test('uploadJson: JSON inválido => onError com a mensagem; onData não é chamado', async () => {
  const errors = [];
  openPicker(() => assert.fail('não deveria chamar onData'), (m) => errors.push(m));
  await pick(new File(['{quebrado'], 'a.json'));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Não foi possível ler o arquivo/);
  assert.equal(document.querySelector('input[type=file]'), null);
});

test('uploadJson: arquivo acima de 2 MB é recusado sem ser lido', async () => {
  const errors = [];
  openPicker(() => assert.fail('não deveria chamar onData'), (m) => errors.push(m));
  const big = new File(['x'], 'grande.json');
  Object.defineProperty(big, 'size', { value: 2 * 1024 * 1024 + 1 });
  big.text = async () => assert.fail('não deve ler arquivo grande');
  await pick(big);
  assert.deepEqual(errors, ['O arquivo é grande demais (máximo de 2 MB).']);
});

test('uploadJson: exatamente 2 MB ainda é aceito', async () => {
  const got = [];
  openPicker((d) => got.push(d), (m) => assert.fail(m));
  const edge = new File(['[1]'], 'limite.json');
  Object.defineProperty(edge, 'size', { value: 2 * 1024 * 1024 });
  await pick(edge);
  assert.deepEqual(got, [[1]]);
});

test('uploadJson: cancelar a seleção (nenhum arquivo) não chama nada, e o input não vaza', async () => {
  openPicker(() => assert.fail('onData'), () => assert.fail('onError'));
  await pick(null);
  assert.equal(document.querySelector('input[type=file]'), null);
});

test('uploadJson: sem onError informado, um erro não derruba nada', async () => {
  openPicker(() => {});
  await pick(new File(['{ruim'], 'a.json'));
});

test('uploadJson: erro lançado por onData é tratado como erro de leitura (não escapa)', async () => {
  const errors = [];
  openPicker(() => { throw new Error('boom'); }, (m) => errors.push(m));
  await pick(new File(['{}'], 'a.json'));
  assert.match(errors[0], /boom/);
});
