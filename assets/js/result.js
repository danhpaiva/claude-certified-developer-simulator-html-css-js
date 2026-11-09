import { h, clear, mount, formatTime, downloadJson } from './dom.js';
import { t, getLang } from './i18n.js';
import { rich } from './rich.js';
import { grade, lettersOf, LETTERS, PASS_REFERENCE } from './scoring.js';
import { optionList, explainBlock, selectHint } from './question.js';

const pct = (n) => `${Math.round(n * 100)}%`;

export function renderResult(root, exam, manifest, attempt, { timeUp }, go) {
  const g = grade(exam, attempt.answers);
  const minCorrect = Math.ceil(PASS_REFERENCE * g.total);
  const above = g.percent >= PASS_REFERENCE;
  const flagged = new Set(attempt.flags || []);
  let filter = 'all';

  const domains = Object.keys(g.byDomain).sort((a, b) => a - b);
  const domainRows = domains.map((d) => {
    const { correct, total } = g.byDomain[d];
    const share = total ? correct / total : 0;
    return h(
      'tr',
      {},
      h('th', { scope: 'row' }, `D${d} · ${manifest.domains[d]?.name ?? ''}`),
      h('td', {}, `${correct}/${total}`),
      h('td', {}, h('div', { class: 'bar', role: 'img', 'aria-label': pct(share) }, h('span', { class: 'bar-fill', style: `width:${Math.round(share * 100)}%` })), pct(share)),
    );
  });

  const reviewHost = h('div', { class: 'review-list' });
  const filterButtons = [
    ['all', t('filterAll')],
    ['wrong', t('filterWrong')],
    ['flagged', t('filterFlagged')],
    ['unanswered', t('filterUnanswered')],
  ].map(([key, label]) =>
    h('button', { type: 'button', class: 'chip', 'aria-pressed': String(key === filter), 'data-filter': key, onclick: () => setFilter(key) }, label),
  );

  function setFilter(key) {
    filter = key;
    filterButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === key)));
    renderReview();
  }

  function renderReview() {
    clear(reviewHost);
    const items = g.items.filter((it) => {
      if (filter === 'wrong') return !it.ok && !it.unanswered;
      if (filter === 'unanswered') return it.unanswered;
      if (filter === 'flagged') return flagged.has(it.num);
      return true;
    });
    if (!items.length) reviewHost.append(h('p', { class: 'status' }, t('noItems')));
    for (const it of items) {
      const q = exam.questions.find((x) => x.num === it.num);
      const copy = q[getLang()];
      const status = it.unanswered ? 'unanswered' : it.ok ? 'ok' : 'bad';
      reviewHost.append(
        h(
          'article',
          { class: `review-item review-${status}` },
          h(
            'header',
            { class: 'q-head' },
            h('h3', { class: 'q-title' }, t('question', { n: q.num, total: g.total })),
            h('span', { class: `badge badge-status-${status}` }, it.unanswered ? t('unansweredLabel') : it.ok ? t('correctLabel') : t('wrongLabel')),
            h('span', { class: 'badge badge-domain' }, `D${q.domain} · ${q.skill}`),
            flagged.has(q.num) ? h('span', { class: 'badge badge-flag' }, '⚑') : null,
            h('span', { class: 'select-hint' }, selectHint(q)),
          ),
          h('div', { class: 'rich stem' }, rich(copy.stem)),
          optionList(q, copy, { given: it.given, name: `rev-${q.num}`, reveal: true, disabled: true }),
          h('p', { class: 'answer-line' }, `${t('yourAnswer')}: `, h('strong', {}, it.given.length ? lettersOf(it.given) : '—'), ` · ${t('correctAnswer')}: `, h('strong', {}, lettersOf(q.answer))),
          explainBlock(q, copy),
        ),
      );
    }
  }

  function exportResult() {
    downloadJson(`ccdv-result-${attempt.id}.json`, {
      examId: exam.id,
      attemptId: attempt.id,
      finishedAt: new Date(attempt.finishedAt).toISOString(),
      mode: attempt.mode,
      lang: attempt.lang,
      correct: g.correct,
      total: g.total,
      percent: Math.round(g.percent * 1000) / 10,
      byDomain: Object.fromEntries(domains.map((d) => [d, g.byDomain[d]])),
      questions: g.items.map((it) => ({
        num: it.num,
        domain: it.domain,
        skill: it.skill,
        correct: it.ok,
        unanswered: it.unanswered,
        flagged: flagged.has(it.num),
        given: it.given.map((i) => LETTERS[i]),
        answer: exam.questions.find((q) => q.num === it.num).answer.map((i) => LETTERS[i]),
      })),
    });
  }

  mount(
    root,
    h('p', { class: 'crumbs' }, h('a', { href: '#/' }, '← ' + t('back'))),
    h('h1', { class: 'page-title' }, t('resultTitle', { exam: exam.id.startsWith('TRAIN-') ? t('trainSessionName', { title: exam.set }) : t('examName', { day: exam.day, set: exam.set }) })),
    timeUp ? h('p', { class: 'notice', role: 'status' }, t('timeUp')) : null,
    h(
      'section',
      { class: 'score-card' },
      h('div', { class: 'score-big' }, pct(g.percent)),
      h(
        'div',
        { class: 'score-detail' },
        h('p', { class: 'score-line' }, t('scoreLine', { correct: g.correct, total: g.total })),
        h('span', { class: 'badge ' + (above ? 'badge-ok' : 'badge-bad') }, above ? t('aboveRef') : t('belowRef')),
        h('p', { class: 'hint' }, t('refLine', { min: minCorrect, total: g.total })),
        h('p', { class: 'hint' }, t('duration', { time: formatTime(attempt.durationMs) }), ` · ${attempt.mode === 'study' ? t('modeStudy') : t('modeExam')}`),
        h('div', { class: 'meter', 'aria-hidden': 'true' }, h('span', { class: 'meter-fill', style: `width:${Math.round(g.percent * 100)}%` }), h('span', { class: 'meter-mark', style: `left:${PASS_REFERENCE * 100}%` })),
      ),
    ),
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: exportResult }, t('exportResult')), h('button', { type: 'button', class: 'btn', onclick: () => go(`#/exam/${exam.id}?mode=${attempt.mode}`) }, t('retry'))),
    h('h2', {}, t('byDomain')),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, h('th', {}, t('domainCol')), h('th', {}, t('hitCol')), h('th', {}, t('pctCol')))), h('tbody', {}, domainRows))),
    h('h2', {}, t('reviewTitle')),
    h('div', { class: 'chips', role: 'group' }, filterButtons),
    reviewHost,
  );
  renderReview();
}

export function missingAttempt(root) {
  root.append(h('p', { class: 'status' }, t('attemptMissing')), h('p', {}, h('a', { href: '#/' }, t('back'))));
}
