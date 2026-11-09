import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// O jsdom não implementa <dialog> modal: o código tem um caminho de reserva (atributo "open"), exercitado aqui.
const dom = new JSDOM('<!DOCTYPE html><html><body><button id="opener">abrir</button></body></html>');
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.Event = dom.window.Event;

const { confirmDialog, notify } = await import('../assets/js/dialogs.js');

const dialogEl = () => document.querySelector('dialog');
const press = (action) => dialogEl().querySelector(`[data-action="${action}"]`).click();
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('confirmDialog: "confirmar" resolve true e remove o diálogo da página', async () => {
  const answer = confirmDialog('Apagar?');
  assert.ok(dialogEl().hasAttribute('open'));
  press('confirm');
  assert.equal(await answer, true);
  assert.equal(dialogEl(), null);
});

test('confirmDialog: "cancelar" resolve false', async () => {
  const answer = confirmDialog('Apagar?');
  press('cancel');
  assert.equal(await answer, false);
});

test('confirmDialog: fechar por fora (Esc) conta como cancelar', async () => {
  const answer = confirmDialog('Apagar?');
  dialogEl().dispatchEvent(new Event('close')); // o navegador dispara "close" ao apertar Esc
  assert.equal(await answer, false);
});

test('confirmDialog: clique no fundo cancela, clique no conteúdo não', async () => {
  const answer = confirmDialog('Apagar?');
  dialogEl().querySelector('h3').click(); // dentro do diálogo: nada acontece
  await tick();
  assert.ok(dialogEl());
  dialogEl().click(); // no próprio <dialog> (fundo): cancela
  assert.equal(await answer, false);
});

test('notify: um único botão, resolve ao fechar e o clique no fundo não fecha', async () => {
  let closed = false;
  const done = notify('Importado.').then(() => (closed = true));
  assert.equal(dialogEl().querySelectorAll('button').length, 1);
  dialogEl().click();
  await tick();
  assert.equal(closed, false);
  press('confirm');
  await done;
  assert.equal(closed, true);
});

test('foco: ação destrutiva começa em "Cancelar"; as demais, em "OK"', async () => {
  const danger = confirmDialog('Apagar tudo?', { danger: true });
  assert.equal(document.activeElement.dataset.action, 'cancel');
  press('cancel');
  await danger;
  const normal = confirmDialog('Continuar?');
  assert.equal(document.activeElement.dataset.action, 'confirm');
  press('cancel');
  await normal;
});

test('foco: volta para o elemento que abriu o diálogo', async () => {
  const opener = document.getElementById('opener');
  opener.focus();
  const answer = confirmDialog('Ok?');
  press('confirm');
  await answer;
  assert.equal(document.activeElement, opener);
});

test('acessibilidade: role alertdialog, título e texto ligados por aria', async () => {
  const answer = confirmDialog('Mensagem');
  const d = dialogEl();
  assert.equal(d.getAttribute('role'), 'alertdialog');
  assert.equal(d.querySelector(`#${d.getAttribute('aria-labelledby')}`).tagName, 'H3');
  assert.ok(d.querySelector(`#${d.getAttribute('aria-describedby')}`).textContent.includes('Mensagem'));
  press('cancel');
  await answer;
});

test('mensagem com várias linhas vira parágrafos e HTML é mostrado como texto (sem injeção)', async () => {
  const answer = confirmDialog('linha 1\n<img src=x onerror="window.pwned=1">');
  const paragraphs = dialogEl().querySelectorAll('.dialog-text');
  assert.equal(paragraphs.length, 2);
  assert.equal(paragraphs[1].textContent, '<img src=x onerror="window.pwned=1">');
  assert.equal(dialogEl().querySelector('img'), null);
  press('cancel');
  await answer;
});

test('rótulos personalizados nos botões', async () => {
  const answer = confirmDialog('x', { confirmLabel: 'Descartar', cancelLabel: 'Voltar' });
  assert.equal(dialogEl().querySelector('[data-action="confirm"]').textContent, 'Descartar');
  assert.equal(dialogEl().querySelector('[data-action="cancel"]').textContent, 'Voltar');
  press('cancel');
  await answer;
});
