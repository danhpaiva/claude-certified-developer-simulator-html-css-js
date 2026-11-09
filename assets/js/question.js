import { h } from './dom.js';
import { t } from './i18n.js';
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

export function selectHint(q) {
  return q.n === 1 ? t('selectOne') : t('selectMany', { n: q.n });
}
