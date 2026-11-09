import { t } from './i18n.js';

// Pequeno helper para montar DOM sem innerHTML (evita injeção e deixa o código legível).
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === false || value == null) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

function append(parent, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

// Como parent.append, mas ignora null/false (o append nativo escreveria "null").
export function mount(parent, ...children) {
  append(parent, children);
  return parent;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function formatTime(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

// Abre o seletor de arquivo e entrega o JSON lido. Erros de leitura vão para onError (nada de alert aqui).
export function uploadJson(onData, onError = () => {}) {
  const input = h('input', { type: 'file', accept: 'application/json,.json' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    try {
      if (!file) return;
      if (file.size > MAX_UPLOAD_BYTES) return onError(t('importTooLarge'));
      onData(JSON.parse(await file.text()));
    } catch (error) {
      onError(t('importReadError', { message: error.message }));
    } finally {
      input.remove();
    }
  });
  document.body.append(input);
  input.click();
}
