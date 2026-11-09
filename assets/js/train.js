import { h, mount, clear } from './dom.js';
import { t, getLang } from './i18n.js';
import { store } from './store.js';

// Tela de seleção de treino personalizado: por domínio ou só as erradas
export function renderTrain(root, manifest, go) {
  const allExams = [];
  
  // Coleta todas as questões de todos os simulados
  async function loadAllQuestions() {
    const promises = manifest.exams.map(async (examMeta) => {
      try {
        const response = await fetch(`data/exams/${examMeta.id}.json`, { cache: 'no-cache' });
        if (!response.ok) return null;
        return await response.json();
      } catch {
        return null;
      }
    });
    const exams = await Promise.all(promises);
    return exams.filter((e) => e !== null);
  }

  // Encontra todas as questões erradas em tentativas anteriores
  function getWrongQuestions(allExams) {
    const attempts = store.attempts();
    const wrongSet = new Set();
    
    attempts.forEach((attempt) => {
      const exam = allExams.find((e) => e.id === attempt.examId);
      if (!exam) return;
      
      exam.questions.forEach((q) => {
        const given = attempt.answers[q.num] || [];
        const correct = [...q.answer].sort((a, b) => a - b);
        const givenSorted = [...given].sort((a, b) => a - b);
        const isCorrect = givenSorted.length === correct.length && givenSorted.every((v, i) => v === correct[i]);
        
        if (!isCorrect && given.length > 0) {
          // Armazena como chave única: examId-questionNum
          wrongSet.add(`${exam.id}-${q.num}`);
        }
      });
    });
    
    return wrongSet;
  }

  // Monta a sessão de treino por domínios
  function buildDomainTraining(domains, difficulty, allExams) {
    const domainSet = new Set(domains);
    let questions = [];
    
    allExams.forEach((exam) => {
      exam.questions.forEach((q) => {
        if (domainSet.has(q.domain)) {
          if (difficulty === 'all' || q.difficulty === difficulty) {
            questions.push({ ...q, sourceExamId: exam.id });
          }
        }
      });
    });
    
    // Embaralha as questões
    questions = shuffle(questions);
    
    // Renumera
    questions = questions.map((q, i) => ({ ...q, num: i + 1 }));
    
    return questions;
  }

  // Monta a sessão de treino só com questões erradas
  function buildWrongOnlyTraining(wrongSet, allExams) {
    let questions = [];
    
    allExams.forEach((exam) => {
      exam.questions.forEach((q) => {
        if (wrongSet.has(`${exam.id}-${q.num}`)) {
          questions.push({ ...q, sourceExamId: exam.id });
        }
      });
    });
    
    // Embaralha
    questions = shuffle(questions);
    
    // Renumera
    questions = questions.map((q, i) => ({ ...q, num: i + 1 }));
    
    return questions;
  }

  function shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // Cria um exame sintético para o treino
  function createTrainingExam(questions, title, id) {
    return {
      id,
      day: 'TREINO',
      set: title,
      minutes: 120, // não usado no modo estudo
      total: questions.length,
      questions,
    };
  }

  // UI: Treino por domínio
  function renderDomainTraining() {
    const selectedDomains = new Set();
    let difficulty = 'all';
    
    const domainCheckboxes = Object.entries(manifest.domains).map(([d, info]) => {
      const id = `domain-${d}`;
      return h(
        'label',
        { class: 'checkbox-label' },
        h('input', {
          type: 'checkbox',
          id,
          value: d,
          onchange: (e) => {
            if (e.target.checked) selectedDomains.add(Number(d));
            else selectedDomains.delete(Number(d));
            updateCount();
          },
        }),
        h('span', {}, `D${d} · ${info.name}`),
      );
    });

    const difficultyRadios = h(
      'div',
      { class: 'radio-group' },
      ['all', 'easy', 'medium', 'hard'].map((level) =>
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
          h('span', {}, level === 'all' ? t('difficultyAll') : level === 'easy' ? t('difficultyEasy') : level === 'medium' ? t('difficultyMedium') : t('difficultyHard')),
        ),
      ),
    );

    const countEl = h('p', { class: 'status' });
    const startBtn = h('button', { type: 'button', class: 'btn btn-primary', disabled: true, onclick: startDomainTrain }, t('startTrain'));

    async function updateCount() {
      if (selectedDomains.size === 0) {
        countEl.textContent = '';
        startBtn.disabled = true;
        return;
      }
      
      countEl.textContent = t('loading');
      const exams = await loadAllQuestions();
      const questions = buildDomainTraining([...selectedDomains], difficulty, exams);
      
      if (questions.length === 0) {
        countEl.textContent = t('noQuestionsAvailable');
        startBtn.disabled = true;
      } else {
        countEl.textContent = t('questionsFound', { count: questions.length });
        startBtn.disabled = false;
      }
    }

    async function startDomainTrain() {
      startBtn.disabled = true;
      const exams = await loadAllQuestions();
      const questions = buildDomainTraining([...selectedDomains], difficulty, exams);
      
      if (questions.length === 0) {
        alert(t('noQuestionsAvailable'));
        return;
      }
      
      const domainList = [...selectedDomains].sort((a, b) => a - b).map((d) => `D${d}`).join('+');
      const diffSuffix = difficulty === 'all' ? '' : `-${difficulty}`;
      const trainId = `TRAIN-${domainList}${diffSuffix}`;
      const title = domainList + (difficulty === 'all' ? '' : ` (${difficulty})`);
      
      const exam = createTrainingExam(questions, title, trainId);
      
      // Salva o exame sintético no cache (será usado pelo exam.js)
      sessionStorage.setItem(`train:${trainId}`, JSON.stringify(exam));
      
      go(`#/exam/${trainId}?mode=study`);
    }

    return h(
      'section',
      { class: 'train-option' },
      h('h3', {}, t('trainByDomain')),
      h('p', {}, t('trainByDomainDesc')),
      h('fieldset', { class: 'domain-fieldset' }, h('legend', {}, t('selectDomains')), ...domainCheckboxes),
      h('fieldset', { class: 'difficulty-fieldset' }, h('legend', {}, t('selectDifficulty')), difficultyRadios),
      countEl,
      startBtn,
    );
  }

  // UI: Só as erradas
  function renderWrongOnlyTraining() {
    const startBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: startWrongTrain }, t('startTrain'));
    const countEl = h('p', { class: 'status' }, t('loading'));

    async function init() {
      const exams = await loadAllQuestions();
      const wrongSet = getWrongQuestions(exams);
      
      if (wrongSet.size === 0) {
        countEl.textContent = t('noWrongAnswers');
        startBtn.disabled = true;
      } else {
        countEl.textContent = t('questionsFound', { count: wrongSet.size });
        startBtn.disabled = false;
      }
    }

    async function startWrongTrain() {
      startBtn.disabled = true;
      const exams = await loadAllQuestions();
      const wrongSet = getWrongQuestions(exams);
      const questions = buildWrongOnlyTraining(wrongSet, exams);
      
      if (questions.length === 0) {
        alert(t('noWrongAnswers'));
        return;
      }
      
      const trainId = 'TRAIN-WRONG';
      const exam = createTrainingExam(questions, t('trainWrong'), trainId);
      
      sessionStorage.setItem(`train:${trainId}`, JSON.stringify(exam));
      
      go(`#/exam/${trainId}?mode=study`);
    }

    init();
    
    return h(
      'section',
      { class: 'train-option' },
      h('h3', {}, t('trainWrongOnly')),
      h('p', {}, t('trainWrongOnlyDesc')),
      countEl,
      startBtn,
    );
  }

  mount(
    root,
    h('section', { class: 'hero' }, h('h1', { class: 'page-title' }, t('trainTitle')), h('p', { class: 'lede' }, t('trainIntro'))),
    renderDomainTraining(),
    renderWrongOnlyTraining(),
  );
}
