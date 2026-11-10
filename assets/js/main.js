import { h, clear } from './dom.js';
import { t, setLang, getLang, detectLang } from './i18n.js';
import { store } from './store.js';
import { renderHome } from './home.js';
import { renderExam } from './exam.js';
import { renderResult, missingAttempt } from './result.js';
import { renderTrain } from './train.js';
import { renderStats } from './stats.js';
import { loadManifest, loadExam } from './exams.js';
import { createRouter } from './router.js';

const root = document.getElementById('app');

export const go = (hash) => {
  if (location.hash === hash) route();
  else location.hash = hash;
};

// A lógica de rotas e de carga de dados está em router.js (testada sem navegador); aqui só se desenha.
function showLoading() {
  clear(root);
  root.append(h('p', { class: 'status' }, t('loading')));
}

function showError(kind) {
  clear(root);
  root.append(h('p', { class: 'status status-error', role: 'alert' }, kind === 'notFound' ? t('notFound') : t('loadError')), h('p', {}, h('a', { href: '#/' }, t('back'))));
}

// Desenha a tela pedida e devolve o dispose dela (se houver).
function show(view) {
  clear(root);
  switch (view.name) {
    case 'train': return renderTrain(root, view.manifest, go);
    case 'stats': return renderStats(root, view.manifest, go);
    case 'exam': return renderExam(root, view.exam, view.mode, go);
    case 'result': return renderResult(root, view.exam, view.manifest, view.attempt, { timeUp: view.timeUp }, go);
    case 'missingAttempt': return missingAttempt(root);
    default: return renderHome(root, view.manifest, { go, rerender: route });
  }
}

const router = createRouter({ loadManifest, loadExam, getAttempt: (id) => store.attempt(id), showLoading, showError, show });

async function route() {
  await router.navigate(location.hash);
  window.scrollTo(0, 0);
}

// ---------- cromo da página: idioma e tema ----------
function applyChrome() {
  document.title = t('appTitle');
  document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll('[data-i18n-label]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nLabel)));
  const langBtn = document.getElementById('lang-toggle');
  langBtn.textContent = getLang() === 'pt' ? 'EN' : 'PT';
}

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

function currentTheme() {
  return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

document.getElementById('lang-toggle').addEventListener('click', () => {
  const next = getLang() === 'pt' ? 'en' : 'pt';
  store.setPref('lang', next);
  setLang(next);
  applyChrome();
  route();
});

document.getElementById('theme-toggle').addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  store.setPref('theme', next);
  applyTheme(next);
});

setLang(detectLang(store.getPref('lang', null)));
applyTheme(store.getPref('theme', null));
applyChrome();
window.addEventListener('hashchange', route);
route();

// Modal de ajuda com atalhos
const helpDialog = document.createElement('dialog');
helpDialog.className = 'dialog help-dialog';
document.body.append(helpDialog);

function showHelp() {
  const row = (keys, text) => h('li', {}, ...keys.flatMap((k, i) => (i ? [' ', h('kbd', {}, k)] : [h('kbd', {}, k)])), ' — ', t(text));
  clear(helpDialog);
  helpDialog.append(
    h('h2', {}, t('helpTitle')),
    h('p', { style: 'margin-bottom: 1.5rem;' }, t('helpIntro')),
    h('h3', {}, t('helpGlobal')),
    h('ul', { class: 'help-list' }, row(['?'], 'helpKeyHelp'), row(['Alt+L'], 'helpKeyLang'), row(['Alt+T'], 'helpKeyTheme')),
    h('h3', {}, t('helpExam')),
    h('ul', { class: 'help-list' }, row(['←', '→'], 'helpKeyNav'), row(['A–E'], 'helpKeyOptions'), row(['F'], 'helpKeyFlag')),
    h('button', { type: 'button', class: 'btn btn-primary', onclick: () => helpDialog.close(), style: 'margin-top: 1.5rem;' }, t('helpClose')),
  );
  helpDialog.showModal();
}

// Atalhos globais
document.addEventListener('keydown', (e) => {
  // ? para ajuda
  if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    showHelp();
  }
  
  // Alt+L para idioma
  if (e.key === 'l' && e.altKey) {
    e.preventDefault();
    document.getElementById('lang-toggle').click();
  }
  
  // Alt+T para tema
  if (e.key === 't' && e.altKey) {
    e.preventDefault();
    document.getElementById('theme-toggle').click();
  }
});

// PWA offline: o service worker só entra no site publicado.
// Em localhost ele fica desligado (senão o cache esconderia as edições nos .js); use ?sw=1 para testá-lo.
if ('serviceWorker' in navigator) {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const wanted = !local || new URLSearchParams(location.search).has('sw');
  window.addEventListener('load', async () => {
    try {
      if (wanted) {
        const registration = await navigator.serviceWorker.register('./sw.js');
        // procura versão nova ao voltar para a aba (além da checagem automática a cada navegação)
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && registration.update());
      } else {
        for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
        for (const name of await caches.keys()) if (name.startsWith('ccdv-')) await caches.delete(name);
      }
    } catch (error) {
      console.warn('[SW]', error);
    }
  });
}
