import { h } from './dom.js';

// Converte o texto das questões em nós DOM: blocos ``` viram <pre><code>,
// `trechos` viram <code>. Tudo entra como texto (sem innerHTML).
export function rich(text) {
  const frag = document.createDocumentFragment();
  text.split(/```[a-zA-Z0-9]*\n?/).forEach((part, i) => {
    if (i % 2 === 1) {
      frag.append(h('pre', { class: 'code', tabindex: '0' }, h('code', {}, part.replace(/\n+$/, ''))));
      return;
    }
    const trimmed = part.replace(/^\n+|\n+$/g, '');
    if (!trimmed) return;
    frag.append(h('p', { class: 'rich-p' }, inlineCode(trimmed)));
  });
  return frag;
}

function inlineCode(text) {
  return text.split(/(`[^`\n]+`)/).map((chunk) =>
    chunk.length > 2 && chunk.startsWith('`') && chunk.endsWith('`')
      ? h('code', { class: 'inline-code' }, chunk.slice(1, -1))
      : chunk,
  );
}
