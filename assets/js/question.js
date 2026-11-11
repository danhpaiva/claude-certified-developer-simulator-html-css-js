import { h } from './dom.js';
import { t, getLang } from './i18n.js';
import { rich } from './rich.js';
import { LETTERS } from './scoring.js';

// Lista de alternativas (radio para resposta única, checkbox para múltipla).
// reveal = mostra certo/errado; disabled = somente leitura.
export function optionList(q, copy, { given, name, reveal = false, disabled = false, onChange }) {
  const multi = q.n > 1;
  const list = h('div', { class: 'options', role: multi ? 'group' : 'radiogroup' });
  copy.options.forEach((text, i) => {
    const selected = given.includes(i);
    const isAnswer = q.answer.includes(i);
    const classes = ['opt'];
    if (selected) classes.push('is-selected');
    if (reveal && isAnswer) classes.push('is-correct');
    if (reveal && selected && !isAnswer) classes.push('is-wrong');
    const input = h('input', {
      type: multi ? 'checkbox' : 'radio',
      name,
      value: String(i),
      checked: selected,
      disabled,
      onchange: () => onChange && onChange(i, input.checked),
    });
    list.append(
      h(
        'label',
        { class: classes.join(' ') },
        input,
        h('span', { class: 'letter', 'aria-hidden': 'true' }, LETTERS[i]),
        h('span', { class: 'opt-text' }, text),
        reveal && isAnswer ? h('span', { class: 'tag tag-ok' }, t('correctLabel')) : null,
        reveal && selected && !isAnswer ? h('span', { class: 'tag tag-bad' }, t('wrongLabel')) : null,
      ),
    );
  });
  return list;
}

export function explainBlock(q, copy) {
  return h(
    'div',
    { class: 'explain' },
    h('h4', {}, t('explanation')),
    h('div', { class: 'rich' }, rich(copy.explanation)),
    q.source
      ? h(
          'p',
          { class: 'source' },
          t('source') + ': ',
          h('a', { href: q.source, target: '_blank', rel: 'noopener noreferrer' }, q.source),
          // mês em que a questão foi conferida na documentação (a plataforma muda rápido)
          q.verified ? ` · ${t('verifiedOn', { date: q.verified })}` : null,
        )
      : null,
  );
}

// Na prova em inglês: botão que abre a mesma questão em português (enunciado, alternativas e, quando a resposta já
// pode ser vista, a explicação). É só apoio de leitura: não mexe nas respostas. Em português devolve null.
// open/onToggle deixam a tela lembrar se o painel estava aberto quando ela é redesenhada.
export function translationBlock(q, { reveal = false, open = false, onToggle } = {}) {
  if (getLang() !== 'en' || !q.pt) return null;
  const copy = q.pt;
  const body = h(
    'div',
    { class: 'translation-body', lang: 'pt-BR' },
    h('div', { class: 'rich stem' }, rich(copy.stem)),
    h(
      'ol',
      { class: 'tr-options' },
      copy.options.map((text, i) =>
        h('li', { class: reveal && q.answer.includes(i) ? 'is-correct' : null }, h('span', { class: 'letter', 'aria-hidden': 'true' }, LETTERS[i]), h('span', { class: 'opt-text' }, text)),
      ),
    ),
    reveal ? h('div', { class: 'rich tr-explanation' }, rich(copy.explanation)) : null,
  );
  const details = h(
    'details',
    { class: 'translation', open, ontoggle: () => onToggle && onToggle(details.open) },
    h('summary', {}, t('showTranslation')),
    body,
  );
  return details;
}

export function selectHint(q) {
  return q.n === 1 ? t('selectOne') : t('selectMany', { n: q.n });
}
