import { h, mount, clear } from './dom.js';
import { t } from './i18n.js';
import { store } from './store.js';
import { loadAllExams } from './exams.js';
import { domainTotals, weakestDomains } from './analysis.js';
import { PASS_REFERENCE } from './scoring.js';

const pct = (n) => `${Math.round(n * 100)}%`;

// Página de estatísticas e evolução. Retorna dispose() para ignorar dados que cheguem depois de sair da página.
export function renderStats(root, manifest, go) {
  const attempts = store.attempts();
  const back = h('p', { class: 'crumbs' }, h('a', { href: '#/' }, '← ' + t('back')));

  if (attempts.length === 0) {
    mount(root, back, h('section', { class: 'hero' }, h('h1', { class: 'page-title' }, t('statsTitle')), h('p', { class: 'lede' }, t('noAttemptsYet'))));
    return undefined;
  }

  const totalAttempts = attempts.length;
  const avgPercent = attempts.reduce((sum, a) => sum + a.percent, 0) / totalAttempts;
  const bestPercent = Math.max(...attempts.map((a) => a.percent));

  const card = (label, value, extraClass = '') =>
    h(
      'div',
      { class: 'stat-card' },
      h('div', { class: 'stat-label' }, label),
      h('div', { class: 'stat-value' }, pct(value)),
      h('div', { class: 'stat-bar' }, h('div', { class: `stat-bar-fill ${extraClass}`.trim(), style: `width: ${Math.round(value * 100)}%` })),
    );

  const overallSection = h(
    'section',
    { class: 'stats-section' },
    h('h2', {}, t('overallProgress')),
    h('p', { class: 'meta' }, t('attemptsCount', { count: totalAttempts })),
    h('div', { class: 'stats-grid' }, card(t('avgScore'), avgPercent), card(t('bestScore'), bestPercent, 'stat-bar-best')),
  );

  const domainSection = h('section', { class: 'stats-section' }, h('h2', {}, t('domainPerformance')), h('p', { class: 'status' }, t('loading')));
  mount(
    root,
    back,
    h('section', { class: 'hero' }, h('h1', { class: 'page-title' }, t('statsTitle')), h('p', { class: 'lede' }, t('statsIntro'))),
    overallSection,
    domainSection,
  );

  let active = true;
  loadAllExams(manifest).then((examsById) => {
    if (!active) return;
    const totals = domainTotals(attempts, examsById, store.train);
    const rows = Object.entries(manifest.domains)
      .map(([d, info]) => {
        const { correct = 0, total = 0 } = totals[d] || {};
        return { domain: d, name: info.name, weight: info.weight, correct, total, avg: total ? correct / total : 0 };
      })
      .filter((r) => r.total > 0);

    const chart = h(
      'div',
      { class: 'domain-chart' },
      rows.map((r) =>
        h(
          'div',
          { class: 'domain-chart-row' },
          h('div', { class: 'domain-chart-label' }, t('domainStats', { domain: r.domain, name: r.name })),
          h('div', { class: 'domain-chart-bar' }, h('div', { class: 'domain-chart-fill', style: `width: ${Math.round(r.avg * 100)}%` }), h('span', { class: 'domain-chart-text' }, `${pct(r.avg)} · ${r.correct}/${r.total}`)),
        ),
      ),
    );

    const weakest = weakestDomains(rows, 3);
    const weaknessSection = weakest.length
      ? h(
          'div',
          { class: 'weakness-section' },
          h('h3', {}, t('suggestedFocus')),
          h('p', {}, t('focusOn')),
          h(
            'ul',
            { class: 'weakness-list' },
            weakest.map((d) =>
              h('li', {}, h('strong', {}, `D${d.domain} · ${d.name}`), ' — ', t('weakItem', { avg: pct(d.avg), weight: d.weight.toFixed(1), lost: d.lost.toFixed(1) })),
            ),
          ),
        )
      : null;

    clear(domainSection);
    mount(domainSection, h('h2', {}, t('domainPerformance')), chart, weaknessSection, h('h2', { class: 'stats-subtitle' }, t('progressOverTime')), renderProgressChart(attempts, avgPercent));
  });

  return () => {
    active = false;
  };
}

// Gráfico de evolução (linha em SVG puro)
function renderProgressChart(attempts, avgPercent) {
  const width = 800;
  const height = 300;
  const padding = { top: 20, right: 40, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const yOf = (value) => padding.top + chartHeight - value * chartHeight;

  const recent = attempts.slice(0, 10).reverse(); // últimas 10, da mais antiga para a mais nova
  const points = recent.map((a, i) => ({
    x: padding.left + (i / Math.max(recent.length - 1, 1)) * chartWidth,
    y: yOf(a.percent),
    index: i,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const yTicks = [0, 0.25, 0.5, PASS_REFERENCE, 1].map((value) => ({ y: yOf(value), label: pct(value) }));
  const hLine = (y, cls, dash) => h('line', { x1: padding.left, y1: y, x2: width - padding.right, y2: y, class: cls, 'stroke-dasharray': dash });

  return h(
    'div',
    { class: 'chart-container' },
    h(
      'svg',
      { viewBox: `0 0 ${width} ${height}`, class: 'progress-chart', role: 'img', 'aria-label': t('progressOverTime') },
      ...yTicks.map((tick) => h('line', { x1: padding.left, y1: tick.y, x2: width - padding.right, y2: tick.y, class: 'chart-grid' })),
      ...yTicks.map((tick) => h('text', { x: padding.left - 10, y: tick.y + 4, class: 'chart-label', 'text-anchor': 'end' }, tick.label)),
      hLine(yOf(PASS_REFERENCE), 'chart-reference', '4 4'),
      hLine(yOf(avgPercent), 'chart-average', '6 3'),
      h('path', { d: linePath, class: 'chart-line', fill: 'none' }),
      ...points.map((p) => h('circle', { cx: p.x, cy: p.y, r: 4, class: 'chart-point' })),
      ...points.map((p) => h('text', { x: p.x, y: height - padding.bottom + 20, class: 'chart-label', 'text-anchor': 'middle' }, t('attemptLabel', { n: recent.length - p.index }))),
    ),
    h('div', { class: 'chart-legend' }, h('span', { class: 'legend-item' }, '—— ' + t('avgScore')), h('span', { class: 'legend-item legend-ref' }, '– – – ' + t('legendRef'))),
  );
}
