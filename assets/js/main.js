import { h, clear } from './dom.js';
import { t, setLang, getLang, detectLang } from './i18n.js';
import { store } from './store.js';
import { renderHome } from './home.js';
import { renderExam } from './exam.js';
import { renderResult, missingAttempt } from './result.js';
import { renderTrain } from './train.js';
import { renderStats } from './stats.js';

const root = document.getElementById('app');
let dispose = null;
let token = 0;
let manifestPromise = null;
const examCache = new Map();

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

const loadManifest = () => (manifestPromise ||= fetchJson('data/exams.json').catch((e) => ((manifestPromise = null), Promise.reject(e))));

async function loadExam(id) {
  // Verifica se é um exame de treino sintético
  if (id.startsWith('TRAIN-')) {
    const cached = sessionStorage.getItem(`train:${id}`);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        throw Object.assign(new Error('not found'), { notFound: true });
      }
    }
    throw Object.assign(new Error('not found'), { notFound: true });
  }
  
  if (!/^D\d+-S\d+$/.test(id)) throw Object.assign(new Error('not found'), { notFound: true });
  if (!examCache.has(id)) {
    try {
      examCache.set(id, await fetchJson(`data/exams/${id}.json`));
    } catch (e) {
      throw Object.assign(e, { notFound: true });
    }
  }
  return examCache.get(id);
}

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
