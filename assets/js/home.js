import { h, mount, downloadJson, uploadJson } from './dom.js';
import { t, getLang } from './i18n.js';
import { store } from './store.js';
import { isTrainId } from './analysis.js';

const pct = (n) => `${Math.round(n * 100)}%`;

export function renderHome(root, manifest, { go, rerender }) {
  const attempts = store.attempts();

  const cards = manifest.exams.map((exam) => {
    const session = store.session(exam.id);
    const last = attempts.find((a) => a.examId === exam.id);

    return h(
      'article',
      { class: 'exam-card' },
      h('h3', {}, t('examName', { day: exam.day, set: exam.set })),
      h('p', { class: 'meta' }, t('examMeta', { total: exam.total, minutes: exam.minutes })),
      last ? h('p', { class: 'meta last' }, t('lastAttempt', { score: `${last.correct}/${last.total} (${pct(last.percent)})` })) : null,
      h(
        'div',
        { class: 'card-actions' },
        session
          ? h('button', { type: 'button', class: 'btn btn-primary', onclick: () => go(`#/exam/${exam.id}`) }, t('resume', { mode: session.mode === 'study' ? t('modeStudy') : t('modeExam') }))
          : [
              h('button', { type: 'button', class: 'btn btn-primary', title: t('modeExamHint'), onclick: () => go(`#/exam/${exam.id}?mode=exam`) }, t('startExam')),
              h('button', { type: 'button', class: 'btn', title: t('modeStudyHint'), onclick: () => go(`#/exam/${exam.id}?mode=study`) }, t('startStudy')),
            ],
        session
          ? h(
              'button',
              {
                type: 'button',
                class: 'btn btn-quiet',
                onclick: () => {
                  if (confirm(t('discardConfirm'))) {
                    store.clearSession(exam.id);
                    rerender();
                  }
                },
              },
              t('discard'),
            )
          : null,
      ),
      // só renderiza linha de PDFs se existir
      exam.pdfs
        ? h(
            'div',
            { class: 'pdf-row' },
            h('span', { class: 'pdf-label' }, t('pdfs')),
            [
              ['pt_exam', 'pdfPtExam'],
              ['pt_key', 'pdfPtKey'],
              ['en_exam', 'pdfEnExam'],
              ['en_key', 'pdfEnKey'],
            ].map(([key, label]) => h('a', { class: 'pdf-link', href: exam.pdfs[key], target: '_blank', rel: 'noopener' }, t(label))),
          )
        : null,
    );
  });

  // Treinos iniciados e não finalizados: dá para continuar ou descartar
  const trainCards = store
    .trains()
    .filter((def) => store.session(def.id))
    .map((def) =>
      h(
        'article',
        { class: 'exam-card' },
        h('h3', {}, t('trainSessionName', { title: def.title })),
        h('p', { class: 'meta' }, t('trainInProgress')),
        h(
          'div',
          { class: 'card-actions' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: () => go(`#/exam/${def.id}?mode=study`) }, t('resume', { mode: t('modeStudy') })),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-quiet',
              onclick: () => {
                if (confirm(t('discardConfirm'))) {
                  store.clearSession(def.id);
                  store.pruneTrains();
                  rerender();
                }
              },
            },
            t('discard'),
          ),
        ),
      ),
    );

  const importBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn',
      onclick: () =>
        uploadJson((data) => {
          const result = store.importAttempts(data);
          if (result.imported === 0 && result.duplicates === 0) {
            alert(t('importError'));
            return;
          }
          alert(t('importSuccess', { count: result.imported }) + (result.duplicates > 0 ? '\n' + t('importDuplicate', { count: result.duplicates }) : ''));
          rerender();
        }),
    },
    t('importAll'),
  );

  const blueprint = h(
    'details',
    { class: 'blueprint' },
    h('summary', {}, t('blueprintTitle')),
    h(
      'table',
      { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, t('blueprintDomain')), h('th', {}, t('blueprintWeight')))),
      h('tbody', {}, Object.entries(manifest.domains).map(([d, info]) => h('tr', {}, h('th', { scope: 'row' }, `D${d} · ${info.name}`), h('td', {}, `${info.weight.toFixed(1)}%`)))),
    ),
  );

  const examName = (id) => {
    if (isTrainId(id)) return t('trainSessionName', { title: store.train(id)?.title ?? id });
    const e = manifest.exams.find((x) => x.id === id);
    return e ? t('examName', { day: e.day, set: e.set }) : id;
  };

  const history = attempts.length
    ? h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'table' },
          h('thead', {}, h('tr', {}, [t('colDate'), t('colExam'), t('colMode'), t('colScore'), t('colAction')].map((c) => h('th', {}, c)))),
          h(
            'tbody',
            {},
            attempts.slice(0, 30).map((a) =>
              h(
                'tr',
                {},
                h('td', {}, new Date(a.finishedAt).toLocaleString(getLang() === 'pt' ? 'pt-BR' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })),
                h('td', {}, examName(a.examId)),
                h('td', {}, a.mode === 'study' ? t('modeStudy') : t('modeExam')),
                h('td', {}, `${a.correct}/${a.total} (${pct(a.percent)})`),
                h('td', {}, h('a', { href: `#/result/${a.id}` }, t('review'))),
              ),
            ),
          ),
        ),
      )
    : h('p', { class: 'status' }, t('historyEmpty'));

  mount(
    root,
    h('section', { class: 'hero' }, h('h1', { class: 'page-title' }, t('tagline')), h('p', { class: 'lede' }, t('modeExamHint') + ' ' + t('modeStudyHint'))),
    h(
      'div',
      { class: 'actions', style: 'margin-bottom: 2rem;' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => go('#/train') }, '🎯 ' + t('trainTitle')),
      attempts.length ? h('button', { type: 'button', class: 'btn', onclick: () => go('#/stats') }, '📊 ' + t('statsTitle')) : null,
    ),
    h('h2', {}, t('examsTitle')),
    h('div', { class: 'cards' }, cards, trainCards),
    blueprint,
    h('h2', {}, t('historyTitle')),
    history,
    // Importar fica sempre disponível (num navegador novo ainda não há histórico para exportar ou limpar)
    h(
      'div',
      { class: 'actions' },
      attempts.length ? h('button', { type: 'button', class: 'btn', onclick: () => downloadJson('ccdv-history.json', attempts) }, t('exportAll')) : null,
      importBtn,
      attempts.length
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn btn-quiet',
              onclick: () => {
                if (confirm(t('clearHistoryConfirm'))) {
                  store.clearAttempts();
                  rerender();
                }
              },
            },
            t('clearHistory'),
          )
        : null,
    ),
  );
}
