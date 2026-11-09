import { h, clear } from './dom.js';
import { t, setLang, getLang, detectLang } from './i18n.js';
import { store } from './store.js';
import { renderHome } from './home.js';
import { renderExam } from './exam.js';
import { renderResult, missingAttempt } from './result.js';
import { renderTrain } from './train.js';
import { renderStats } from './stats.js';
import { loadManifest, loadExam } from './exams.js';

const root = document.getElementById('app');
let dispose = null;
let token = 0;
function parseHash() {
  const [path, query = ''] = (location.hash.slice(1) || '/').split('?');
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(query) };
}

export const go = (hash) => {
  if (location.hash === hash) route();
  else location.hash = hash;
};

async function route() {
  const mine = ++token;
  if (dispose) dispose();
  dispose = null;
  clear(root);
  root.append(h('p', { class: 'status' }, t('loading')));
  try {
    const { parts, params } = parseHash();
    let view;
    if (parts[0] === 'train') {
      const manifest = await loadManifest();
      view = () => renderTrain(root, manifest, go);
    } else if (parts[0] === 'stats') {
      const manifest = await loadManifest();
      view = () => renderStats(root, manifest, go);
    } else if (parts[0] === 'exam' && parts[1]) {
      const [exam] = await Promise.all([loadExam(parts[1]), loadManifest()]);
      view = () => renderExam(root, exam, params.get('mode') === 'study' ? 'study' : 'exam', go);
    } else if (parts[0] === 'result' && parts[1]) {
      const attempt = store.attempt(parts[1]);
      if (!attempt) view = () => missingAttempt(root);
      else {
        const [exam, manifest] = await Promise.all([loadExam(attempt.examId), loadManifest()]);
        view = () => renderResult(root, exam, manifest, attempt, { timeUp: params.has('timeup') }, go);
      }
    } else {
      const manifest = await loadManifest();
      view = () => renderHome(root, manifest, { go, rerender: route });
    }
    if (mine !== token) return;
    clear(root);
    dispose = view() || null;
  } catch (error) {
    if (mine !== token) return;
    clear(root);
    root.append(h('p', { class: 'status status-error', role: 'alert' }, error.notFound ? t('notFound') : t('loadError')), h('p', {}, h('a', { href: '#/' }, t('back'))));
  }
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

// Registra o service worker para PWA offline
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(
      (registration) => {
        console.log('[SW] Registered:', registration.scope);
        
        // Verifica atualizações a cada 1 hora
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);
        
        // Escuta novas versões
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[SW] New version available');
                // Pode exibir um aviso ao usuário aqui, mas por ora só loga
              }
            });
          }
        });
      },
      (error) => {
        console.log('[SW] Registration failed:', error);
      }
    );
  });
}
