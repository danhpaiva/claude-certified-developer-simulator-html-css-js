import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Mock do DOM para testes
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.DocumentFragment = dom.window.DocumentFragment;

import { rich } from '../assets/js/rich.js';

test('rich: texto simples vira parágrafo', () => {
  const result = rich('Texto simples');
  assert.ok(result instanceof DocumentFragment);
  assert.equal(result.childNodes.length, 1);
  assert.equal(result.firstChild.tagName, 'P');
  assert.ok(result.textContent.includes('Texto simples'));
});

test('rich: código inline com crase única', () => {
  const result = rich('Use o método `fetch()` aqui');
  const p = result.querySelector('p');
  assert.ok(p);
  
  const code = p.querySelector('code');
  assert.ok(code);
  assert.equal(code.textContent, 'fetch()');
});

test('rich: bloco de código com três crases', () => {
  const input = 'Exemplo:\n```\nconst x = 1;\n```\nFim.';
  const result = rich(input);
  
  const pre = result.querySelector('pre');
  assert.ok(pre, 'Deve ter elemento <pre>');
  
  const code = pre.querySelector('code');
  assert.ok(code, 'Deve ter <code> dentro do <pre>');
  assert.ok(code.textContent.includes('const x = 1;'));
});

test('rich: múltiplos códigos inline', () => {
  const result = rich('Use `const` ou `let`, nunca `var`');
  const codes = result.querySelectorAll('code.inline-code');
  
  assert.equal(codes.length, 3);
  assert.equal(codes[0].textContent, 'const');
  assert.equal(codes[1].textContent, 'let');
  assert.equal(codes[2].textContent, 'var');
});

test('rich: retorna DocumentFragment', () => {
  const result = rich('Apenas texto normal');
  assert.ok(result instanceof DocumentFragment);
});

test('rich: string vazia retorna fragment vazio', () => {
  const result = rich('');
  assert.ok(result instanceof DocumentFragment);
  assert.equal(result.childNodes.length, 0);
});

test('rich: escape HTML não é processado (segurança)', () => {
  const result = rich('Use `<script>alert(1)</script>` com cuidado');
  const code = result.querySelector('code');
  
  // Deve estar como texto, não como HTML executável
  assert.equal(code.textContent, '<script>alert(1)</script>');
  assert.equal(code.children.length, 0);
});
