import { h, mount } from './dom.js';
import { t } from './i18n.js';
import { store } from './store.js';
import { loadAllExams } from './exams.js';
import { latestOutcomes, wrongKeys } from './analysis.js';

// Embaralha uma cópia (Fisher–Yates).
function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Cada treino tem um id próprio. Assim uma sessão abandonada nunca contamina um treino novo.
const newTrainId = () => `TRAIN-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Tela de seleção de treino personalizado: por domínio ou só as erradas.
export function renderTrain(root, manifest, go) {
  const examsPromise = loadAllExams(manifest); // os simulados são baixados uma vez só

  // Referências [idDoSimulado, númeroDaQuestão] das questões que passam no filtro, já embaralhadas.
  function pickRefs(examsById, accept) {
    const refs = [];
    for (const exam of Object.values(examsById)) {
      for (const q of exam.questions) if (accept(exam, q)) refs.push([exam.id, q.num]);
    }
    return shuffle(refs);
  }

  function startTraining(refs, title) {
    const def = { id: newTrainId(), title, refs, createdAt: Date.now() };
    store.saveTrain(def);
    go(`#/exam/${def.id}?mode=study`);
  }

  // ---------- treino por domínio ----------
  function renderDomainTraining() {
    const selected = new Set();
    let difficulty = 'all';
    const countEl = h('p', { class: 'status', 'aria-live': 'polite' });
    const startBtn = h('button', { type: 'button', class: 'btn btn-primary', disabled: true, onclick: start }, t('startTrain'));

    const accept = (exam, q) => selected.has(q.domain) && (difficulty === 'all' || q.difficulty === difficulty);

    async function updateCount() {
      if (!selected.size) {
        countEl.textContent = '';
        startBtn.disabled = true;
        return;
      }
      const count = pickRefs(await examsPromise, accept).length;
      countEl.textContent = count ? t('questionsFound', { count }) : t('noQuestionsAvailable');
      startBtn.disabled = count === 0;
    }

    async function start() {
      startBtn.disabled = true;
      const refs = pickRefs(await examsPromise, accept);
      if (!refs.length) {
        countEl.textContent = t('noQuestionsAvailable');
        return;
      }
      const domains = [...selected].sort((a, b) => a - b).map((d) => `D${d}`).join('+');
      startTraining(refs, domains + (difficulty === 'all' ? '' : ` (${difficulty})`));
    }

    const domainBoxes = Object.entries(manifest.domains).map(([d, info]) =>
      h(
        'label',
        { class: 'checkbox-label' },
        h('input', {
          type: 'checkbox',
          id: `domain-${d}`,
          value: d,
          onchange: (e) => {
            if (e.target.checked) selected.add(Number(d));
            else selected.delete(Number(d));
            updateCount();
          },
        }),
        h('span', {}, `D${d} · ${info.name}`),
      ),
    );

    const levels = { all: 'difficultyAll', easy: 'difficultyEasy', medium: 'difficultyMedium', hard: 'difficultyHard' };
    const difficultyRadios = h(
      'div',
      { class: 'radio-group' },
      Object.entries(levels).map(([level, key]) =>
        h(
          'label',
          { class: 'radio-label' },
          h('input', {
            type: 'radio',
            name: 'difficulty',
            value: level,
            checked: level === 'all',
            onchange: () => {
              difficulty = level;
              updateCount();
            },
          }),
          h('span', {}, t(key)),
        ),
      ),
    );

    return h(
      'section',
      { class: 'train-option' },
      h('h3', {}, t('trainByDomain')),
      h('p', {}, t('trainByDomainDesc')),
      h('fieldset', { class: 'domain-fieldset' }, h('legend', {}, t('selectDomains')), ...domainBoxes),
      h('fieldset', { class: 'difficulty-fieldset' }, h('legend', {}, t('selectDifficulty')), difficultyRadios),
      countEl,
      startBtn,
    );
  }

  // ---------- só as erradas ----------
  function renderWrongOnlyTraining() {
    const countEl = h('p', { class: 'status', 'aria-live': 'polite' }, t('loading'));
    const startBtn = h('button', { type: 'button', class: 'btn btn-primary', disabled: true, onclick: start }, t('startTrain'));

    // Vale o resultado mais recente de cada questão: errou e depois acertou, sai da lista.
    async function currentWrong() {
      const examsById = await examsPromise;
      return new Set(wrongKeys(latestOutcomes(store.attempts(), examsById, store.train)));
    }

    async function init() {
      const wrong = await currentWrong();
      countEl.textContent = wrong.size ? t('questionsFound', { count: wrong.size }) : t('noWrongAnswers');
      startBtn.disabled = wrong.size === 0;
    }

    async function start() {
      startBtn.disabled = true;
      const wrong = await currentWrong();
      const refs = pickRefs(await examsPromise, (exam, q) => wrong.has(`${exam.id}#${q.num}`));
      if (!refs.length) {
        countEl.textContent = t('noWrongAnswers');
        return;
      }
      startTraining(refs, t('trainWrong'));
    }

    init();

    return h('section', { class: 'train-option' }, h('h3', {}, t('trainWrongOnly')), h('p', {}, t('trainWrongOnlyDesc')), countEl, startBtn);
  }

  mount(
    root,
    h('section', { class: 'hero' }, h('h1', { class: 'page-title' }, t('trainTitle')), h('p', { class: 'lede' }, t('trainIntro'))),
    renderDomainTraining(),
    renderWrongOnlyTraining(),
  );
}
