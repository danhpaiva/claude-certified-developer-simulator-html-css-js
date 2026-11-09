import { h, mount } from './dom.js';
import { t } from './i18n.js';
import { store } from './store.js';

const pct = (n) => `${Math.round(n * 100)}%`;

// Página de estatísticas e evolução
export function renderStats(root, manifest, go) {
  const attempts = store.attempts();

  if (attempts.length === 0) {
    mount(
      root,
      h('p', { class: 'crumbs' }, h('a', { href: '#/' }, '← ' + t('back'))),
      h('section', { class: 'hero' }, h('h1', { class: 'page-title' }, t('statsTitle')), h('p', { class: 'lede' }, t('noAttemptsYet'))),
    );
    return;
  }

  // Calcula estatísticas gerais
  const totalAttempts = attempts.length;
  const avgPercent = attempts.reduce((sum, a) => sum + a.percent, 0) / totalAttempts;
  const bestPercent = Math.max(...attempts.map((a) => a.percent));
  const bestAttempt = attempts.find((a) => a.percent === bestPercent);

  // Agrupa tentativas por domínio
  const domainData = {};
  manifest.domains && Object.keys(manifest.domains).forEach((d) => {
    domainData[d] = {
      name: manifest.domains[d].name,
      weight: manifest.domains[d].weight,
      attempts: [],
      totalCorrect: 0,
      totalQuestions: 0,
    };
  });

  // Processa cada tentativa e extrai dados por domínio
  attempts.forEach((attempt, attemptIndex) => {
    // Carrega o exame correspondente do cache ou tenta inferir dos dados
    // Para simplificar, vamos analisar o que está salvo no attempt
    // O resultado salva byDomain se foi exportado, mas precisamos recalcular
    
    // Carrega o exame e recalcula
    fetch(`data/exams/${attempt.examId}.json`, { cache: 'no-cache' })
      .then((r) => r.ok ? r.json() : null)
      .then((exam) => {
        if (!exam) return;
        
        exam.questions.forEach((q) => {
          const given = attempt.answers[q.num] || [];
          const correct = [...q.answer].sort((a, b) => a - b);
          const givenSorted = [...given].sort((a, b) => a - b);
          const isCorrect = givenSorted.length === correct.length && givenSorted.every((v, i) => v === correct[i]);
          
          if (domainData[q.domain]) {
            domainData[q.domain].totalQuestions++;
            if (isCorrect) domainData[q.domain].totalCorrect++;
            
            // Adiciona à tentativa específica
            if (!domainData[q.domain].attempts[attemptIndex]) {
              domainData[q.domain].attempts[attemptIndex] = { correct: 0, total: 0 };
            }
            domainData[q.domain].attempts[attemptIndex].total++;
            if (isCorrect) domainData[q.domain].attempts[attemptIndex].correct++;
          }
        });
      })
      .catch(() => {});
  });

  // Resumo geral
  const overallSection = h(
    'section',
    { class: 'stats-section' },
    h('h2', {}, t('overallProgress')),
    h('p', { class: 'meta' }, t('attemptsCount', { count: totalAttempts })),
    h(
      'div',
      { class: 'stats-grid' },
      h(
        'div',
        { class: 'stat-card' },
        h('div', { class: 'stat-label' }, t('avgScore')),
        h('div', { class: 'stat-value' }, pct(avgPercent)),
        h('div', { class: 'stat-bar' }, h('div', { class: 'stat-bar-fill', style: `width: ${Math.round(avgPercent * 100)}%` })),
      ),
      h(
        'div',
        { class: 'stat-card' },
        h('div', { class: 'stat-label' }, t('bestScore')),
        h('div', { class: 'stat-value' }, pct(bestPercent)),
        h('div', { class: 'stat-bar' }, h('div', { class: 'stat-bar-fill stat-bar-best', style: `width: ${Math.round(bestPercent * 100)}%` })),
      ),
    ),
  );

  // Desempenho por domínio (renderiza depois que os dados forem carregados)
  const domainSection = h('section', { class: 'stats-section' }, h('h2', {}, t('domainPerformance')), h('p', { class: 'status' }, t('loading')));

  // Função para renderizar os domínios após carregamento
  setTimeout(() => {
    const domains = Object.keys(domainData).sort((a, b) => Number(a) - Number(b));
    const domainRows = domains.map((d) => {
      const data = domainData[d];
      const avg = data.totalQuestions > 0 ? data.totalCorrect / data.totalQuestions : 0;
      const weighted = avg * (data.weight / 100);

      return {
        domain: d,
        name: data.name,
        avg,
        weighted,
        weight: data.weight,
        correct: data.totalCorrect,
        total: data.totalQuestions,
      };
    }).filter((d) => d.total > 0);

    // Ordena por pontuação ponderada
    const sortedByWeighted = [...domainRows].sort((a, b) => b.weighted - a.weighted);
    const weakest = sortedByWeighted.slice(-3).reverse();

    // Gráfico de barras por domínio
    const chart = h(
      'div',
      { class: 'domain-chart' },
      domainRows.map((d) =>
        h(
          'div',
          { class: 'domain-chart-row' },
          h('div', { class: 'domain-chart-label' }, t('domainStats', { domain: d.domain, name: d.name })),
          h(
            'div',
            { class: 'domain-chart-bar' },
            h('div', { class: 'domain-chart-fill', style: `width: ${Math.round(d.avg * 100)}%` }),
            h('span', { class: 'domain-chart-text' }, `${pct(d.avg)} · ${d.correct}/${d.total}`),
          ),
        ),
      ),
    );

    // Pontos fracos (sugestão de estudo)
    const weaknessSection = h(
      'div',
      { class: 'weakness-section' },
      h('h3', {}, t('suggestedFocus')),
      h('p', {}, t('focusOn')),
      h(
        'ul',
        { class: 'weakness-list' },
        weakest.map((d) =>
          h(
            'li',
            {},
            h('strong', {}, `D${d.domain} · ${d.name}`),
            ` — ${pct(d.avg)} (peso ${d.weight.toFixed(1)}%, impacto ${pct(d.weighted)} na nota)`,
          ),
        ),
      ),
    );

    // SVG: Evolução ao longo do tempo (line chart)
    const progressChart = renderProgressChart(attempts, avgPercent);

    mount(
      domainSection,
      h('h2', {}, t('domainPerformance')),
      chart,
      weaknessSection,
      h('h2', { style: 'margin-top: 3rem;' }, t('progressOverTime')),
      progressChart,
    );
  }, 500); // Aguarda um pouco para os fetches processarem

  mount(
    root,
    h('p', { class: 'crumbs' }, h('a', { href: '#/' }, '← ' + t('back'))),
    h('section', { class: 'hero' }, h('h1', { class: 'page-title' }, t('statsTitle')), h('p', { class: 'lede' }, t('statsIntro'))),
    overallSection,
    domainSection,
  );
}

// Gráfico de evolução (line chart em SVG puro)
function renderProgressChart(attempts, avgPercent) {
  const width = 800;
  const height = 300;
  const padding = { top: 20, right: 40, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Pega as últimas 10 tentativas (ou todas se houver menos)
  const recent = attempts.slice(0, 10).reverse();
  const maxY = 1; // 100%
  const minY = 0;

  // Pontos do gráfico
  const points = recent.map((a, i) => {
    const x = padding.left + (i / Math.max(recent.length - 1, 1)) * chartWidth;
    const y = padding.top + chartHeight - (a.percent / maxY) * chartHeight;
    return { x, y, percent: a.percent, index: i };
  });

  // Linha de média
  const avgY = padding.top + chartHeight - (avgPercent / maxY) * chartHeight;

  // Path da linha
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  // Eixo Y (marcas de 0% a 100%)
  const yTicks = [0, 0.25, 0.5, 0.72, 1].map((val) => {
    const y = padding.top + chartHeight - (val / maxY) * chartHeight;
    return { y, label: pct(val) };
  });

  return h(
    'div',
    { class: 'chart-container' },
    h(
      'svg',
      { viewBox: `0 0 ${width} ${height}`, class: 'progress-chart', role: 'img', 'aria-label': t('progressOverTime') },
      // Grade horizontal
      ...yTicks.map((tick) =>
        h('line', {
          x1: padding.left,
          y1: tick.y,
          x2: width - padding.right,
          y2: tick.y,
          class: 'chart-grid',
        }),
      ),
      // Labels do eixo Y
      ...yTicks.map((tick) =>
        h('text', { x: padding.left - 10, y: tick.y + 4, class: 'chart-label', 'text-anchor': 'end' }, tick.label),
      ),
      // Linha de referência (72%)
      h('line', {
        x1: padding.left,
        y1: padding.top + chartHeight - (0.72 / maxY) * chartHeight,
        x2: width - padding.right,
        y2: padding.top + chartHeight - (0.72 / maxY) * chartHeight,
        class: 'chart-reference',
        'stroke-dasharray': '4 4',
      }),
      // Linha de média
      h('line', {
        x1: padding.left,
        y1: avgY,
        x2: width - padding.right,
        y2: avgY,
        class: 'chart-average',
        'stroke-dasharray': '6 3',
      }),
      // Linha de progresso
      h('path', { d: linePath, class: 'chart-line', fill: 'none' }),
      // Pontos
      ...points.map((p) => h('circle', { cx: p.x, cy: p.y, r: 4, class: 'chart-point' })),
      // Labels do eixo X
      ...points.map((p) =>
        h('text', { x: p.x, y: height - padding.bottom + 20, class: 'chart-label', 'text-anchor': 'middle' }, t('attemptLabel', { n: recent.length - p.index })),
      ),
    ),
    h('div', { class: 'chart-legend' }, h('span', { class: 'legend-item' }, '—— ', t('avgScore')), h('span', { class: 'legend-item legend-ref' }, '– – – 72% (', t('aboveRef').toLowerCase(), ')')),
  );
}
