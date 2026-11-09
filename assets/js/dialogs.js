// Diálogos próprios no lugar de alert()/confirm(): seguem o tema do site, são traduzidos,
// acessíveis (role alertdialog, foco no botão seguro, Esc cancela, o foco volta a quem abriu)
// e não congelam a página como os diálogos nativos.
import { h } from './dom.js';
import { t } from './i18n.js';

let counter = 0;

function openModal(dialog) {
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', ''); // ambientes sem <dialog> modal (ex.: testes com jsdom)
}

function ask({ title, message, confirmLabel, cancelLabel, danger = false, withCancel = true }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const id = `dialog-${++counter}`;
    let result = false;

    const paragraphs = String(message)
      .split('\n')
      .map((line) => h('p', { class: 'dialog-text' }, line));

    const confirmBtn = h(
      'button',
      { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, 'data-action': 'confirm', onclick: () => finish(true) },
      confirmLabel ?? t('dialogOk'),
    );
    const cancelBtn = withCancel
      ? h('button', { type: 'button', class: 'btn', 'data-action': 'cancel', onclick: () => finish(false) }, cancelLabel ?? t('dialogCancel'))
      : null;

    const dialog = h(
      'dialog',
      { class: 'dialog', role: 'alertdialog', 'aria-labelledby': `${id}-title`, 'aria-describedby': `${id}-text` },
      h('h3', { id: `${id}-title` }, title ?? (withCancel ? t('dialogConfirmTitle') : t('dialogNoticeTitle'))),
      h('div', { id: `${id}-text` }, paragraphs),
      h('div', { class: 'dialog-actions' }, cancelBtn, confirmBtn),
    );

    function finish(value) {
      result = value;
      if (typeof dialog.close === 'function') dialog.close();
      else {
        dialog.removeAttribute('open');
        dialog.dispatchEvent(new Event('close'));
      }
    }

    // Esc (evento "cancel") e qualquer outro fechamento caem aqui: resultado padrão = false
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (opener && typeof opener.focus === 'function') opener.focus();
      resolve(result);
    });
    // clique no fundo escurecido cancela (só em confirmações; um aviso exige o botão OK)
    dialog.addEventListener('click', (event) => {
      if (withCancel && event.target === dialog) finish(false);
    });

    document.body.append(dialog);
    openModal(dialog);
    // ação destrutiva: o foco começa em "Cancelar", para Enter nunca apagar por engano
    (danger && cancelBtn ? cancelBtn : confirmBtn).focus();
  });
}

// Pergunta de sim/não. Resolve true ao confirmar e false ao cancelar, pressionar Esc ou clicar fora.
export const confirmDialog = (message, options = {}) => ask({ message, ...options });

// Aviso informativo com um único botão. Resolve quando o usuário fecha.
export const notify = (message, options = {}) => ask({ message, withCancel: false, ...options }).then(() => undefined);
