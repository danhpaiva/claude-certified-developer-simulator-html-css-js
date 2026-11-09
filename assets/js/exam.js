import { h, clear, formatTime } from './dom.js';
import { t, getLang } from './i18n.js';
import { store } from './store.js';
import { rich } from './rich.js';
import { grade, isCorrect, LETTERS } from './scoring.js';
import { optionList, explainBlock, selectHint } from './question.js';
import { isTrainId } from './analysis.js';

// Tela de prova. Retorna uma função dispose() para limpar timers e atalhos.
export function renderExam(root, exam, requestedMode, go) {
  // Treinos sempre rodam em modo estudo, sem cronômetro
  const isTrain = isTrainId(exam.id);
  const effectiveMode = isTrain ? 'study' : requestedMode;
  
  let session = store.session(exam.id);
  if (!session) {
    const now = Date.now();
    session = {
      mode: effectiveMode,
      startedAt: now,
      deadline: effectiveMode === 'exam' ? now + exam.minutes * 60000 : null,
      answers: {},
      flags: [],
      checked: [],
      current: 0,
      paused: false,
      pausedAt: null,
      totalPausedMs: 0,
      warned10: false,
      warned5: false,
    };
    store.saveSession(exam.id, session);
  }
  const total = exam.questions.length;
  const isStudy = session.mode === 'study';
  const save = () => store.saveSession(exam.id, session);

  const timerEl = h('span', { class: 'timer', role: 'timer' });
  const pauseBtn = h('button', { type: 'button', class: 'btn btn-small', onclick: togglePause }, isStudy ? null : (session.paused ? t('resumeTimer') : t('pause')));
  const progressEl = h('span', { class: 'progress-text' });
  const cardHost = h('section', { class: 'q-host' });
  const navButtons = exam.questions.map((q, i) =>
    h('button', { type: 'button', class: 'nav-btn', 'aria-label': t('question', { n: i + 1, total }), onclick: () => goTo(i) }, String(i + 1)),
  );
  const prevBtn = h('button', { type: 'button', class: 'btn', onclick: () => goTo(session.current - 1) }, '← ' + t('prev'));
  const nextBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => goTo(session.current + 1) }, t('next') + ' →');
  const flagBtn = h('button', { type: 'button', class: 'btn', 'aria-pressed': 'false', onclick: toggleFlag }, '');
  const dialog = h('dialog', { class: 'dialog' });

  const topbar = h(
    'div',
    { class: 'exam-bar' },
    h(
      'div',
      { class: 'exam-bar-title' },
      isTrain ? t('trainSessionName', { title: exam.set }) : t('examName', { day: exam.day, set: exam.set }),
      h('span', { class: 'badge' }, isStudy ? t('modeStudy') : session.paused ? t('paused') : t('modeExam')),
    ),
    h('div', { class: 'exam-bar-timer' }, h('span', { class: 'timer-label' }, isStudy ? t('noTimer') : t('timeLeft')), isStudy ? null : timerEl, isStudy ? null : pauseBtn),
    h('div', { class: 'exam-bar-actions' }, progressEl, h('button', { type: 'button', class: 'btn btn-danger', onclick: askFinish }, t('finish'))),
  );

  root.append(
    topbar,
    h(
      'div',
      { class: 'exam-layout' },
      h('div', { class: 'exam-main' }, cardHost, h('div', { class: 'q-actions' }, prevBtn, flagBtn, nextBtn), h('p', { class: 'hint' }, t('shortcuts'))),
      h('aside', { class: 'exam-side' }, h('h3', { class: 'side-title' }, t('navigator')), h('nav', { class: 'navigator', 'aria-label': t('navigator') }, navButtons)),
    ),
    dialog,
  );

  // ---------- estado ----------
  function currentQ() {
    return exam.questions[session.current];
  }

  function setAnswer(q, index, on) {
    const given = new Set(session.answers[q.num] || []);
    if (q.n > 1) {
      if (on) given.add(index);
      else given.delete(index);
    } else if (on) {
      given.clear();
      given.add(index);
    }
    session.answers[q.num] = [...given].sort((a, b) => a - b);
    save();
  }

  function goTo(i) {
    if (i < 0 || i >= total) return;
    session.current = i;
    save();
    renderCard();
    refreshChrome();
    cardHost.querySelector('.q-title')?.focus({ preventScroll: true });
    cardHost.scrollIntoView({ block: 'nearest' });
  }

  function toggleFlag() {
    const num = currentQ().num;
    const i = session.flags.indexOf(num);
    if (i >= 0) session.flags.splice(i, 1);
    else session.flags.push(num);
    save();
    refreshChrome();
  }

  function togglePause() {
    if (isStudy) return; // modo estudo não tem cronômetro
    
    session.paused = !session.paused;
    
    if (session.paused) {
      session.pausedAt = Date.now();
    } else if (session.pausedAt) {
      // Acumula o tempo pausado e estende o deadline
      const pauseDuration = Date.now() - session.pausedAt;
      session.totalPausedMs += pauseDuration;
      if (session.deadline) {
        session.deadline += pauseDuration;
      }
      session.pausedAt = null;
    }
    
    save();
    pauseBtn.textContent = session.paused ? t('resumeTimer') : t('pause');
    topbar.querySelector('.badge').textContent = session.paused ? t('paused') : t('modeExam');
    renderCard();
    refreshChrome();
  }

  // ---------- renderização ----------
  const isPaused = () => !isStudy && session.paused;

  function renderCard() {
    if (isPaused()) {
      clear(cardHost);
      cardHost.append(
        h('div', { class: 'paused-panel', role: 'status' }, h('h2', {}, t('pausedTitle')), h('p', {}, t('pausedHint')), h('button', { type: 'button', class: 'btn btn-primary', onclick: togglePause }, t('resumeTimer'))),
      );
      return;
    }
    const q = currentQ();
    const copy = q[getLang()];
    const given = session.answers[q.num] || [];
    const checked = isStudy && session.checked.includes(q.num);
    clear(cardHost);

    const card = h(
      'fieldset',
      { class: 'q-card' },
      h('legend', { class: 'sr-only' }, t('question', { n: session.current + 1, total })),
      h(
        'div',
        { class: 'q-head' },
        h('h2', { class: 'q-title', tabindex: '-1' }, t('question', { n: session.current + 1, total })),
        h('span', { class: 'badge badge-domain' }, `D${q.domain} · ${q.skill}`),
        h('span', { class: 'badge badge-' + q.difficulty }, q.difficulty),
        h('span', { class: 'select-hint' }, selectHint(q)),
      ),
      h('div', { class: 'rich stem' }, rich(copy.stem)),
      optionList(q, copy, {
        given,
        name: 'opt-' + q.num,
        reveal: checked,
        disabled: checked,
        onChange: (i, on) => {
          setAnswer(q, i, on);
          refreshChrome();
          card.querySelectorAll('.opt').forEach((el) => el.classList.toggle('is-selected', el.querySelector('input').checked));
          if (checkBtn) checkBtn.disabled = !(session.answers[q.num] || []).length;
        },
      }),
    );

    let checkBtn = null;
    if (isStudy && !checked) {
      checkBtn = h(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary check-btn',
          disabled: !given.length,
          onclick: () => {
            session.checked.push(q.num);
            save();
            renderCard();
            refreshChrome();
          },
        },
        t('check'),
      );
      card.append(checkBtn);
    }
    if (checked) {
      const ok = isCorrect(q, given);
      card.append(h('p', { class: 'verdict ' + (ok ? 'verdict-ok' : 'verdict-bad'), role: 'status' }, ok ? t('correctLabel') : t('wrongLabel')), explainBlock(q, copy));
    }
    cardHost.append(card);
  }

  function refreshChrome() {
    const answered = Object.values(session.answers).filter((a) => a.length).length;
    progressEl.textContent = t('answered', { n: answered, total });
    exam.questions.forEach((q, i) => {
      const btn = navButtons[i];
      const given = session.answers[q.num] || [];
      const classes = ['nav-btn'];
      if (i === session.current) classes.push('is-current');
      if (given.length) classes.push('is-done');
      if (session.flags.includes(q.num)) classes.push('is-flag');
      if (isStudy && session.checked.includes(q.num)) classes.push(isCorrect(q, given) ? 'is-ok' : 'is-bad');
      btn.className = classes.join(' ');
      if (i === session.current) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
    const locked = isPaused();
    navButtons.forEach((btn) => (btn.disabled = locked));
    prevBtn.disabled = locked || session.current === 0;
    nextBtn.disabled = locked || session.current === total - 1;
    flagBtn.disabled = locked;
    const flagged = session.flags.includes(currentQ().num);
    flagBtn.textContent = (flagged ? '⚑ ' : '⚐ ') + (flagged ? t('unflag') : t('flag'));
    flagBtn.setAttribute('aria-pressed', String(flagged));
  }

  // ---------- finalização ----------
  function submit(timeUp) {
    const g = grade(exam, session.answers);
    const attempt = {
      id: `${exam.id}-${Date.now()}`,
      examId: exam.id,
      finishedAt: Date.now(),
      mode: session.mode,
      lang: getLang(),
      durationMs: Math.max(0, Date.now() - session.startedAt - (session.totalPausedMs || 0) - (session.paused && session.pausedAt ? Date.now() - session.pausedAt : 0)),
      answers: session.answers,
      flags: session.flags,
      correct: g.correct,
      total: g.total,
      percent: g.percent,
    };
    store.addAttempt(attempt);
    store.clearSession(exam.id);

    go(`#/result/${attempt.id}${timeUp ? '?timeup=1' : ''}`);
  }

  function askFinish() {
    const answered = Object.values(session.answers).filter((a) => a.length).length;
    clear(dialog);
    dialog.append(
      h('h3', {}, t('finishTitle')),
      h('p', {}, t('finishBody', { answered, total, unanswered: total - answered })),
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => dialog.close() }, t('cancel')),
        h('button', { type: 'button', class: 'btn btn-danger', onclick: () => submit(false) }, t('finishConfirm')),
      ),
    );
    dialog.showModal();
  }

  // ---------- timer e atalhos ----------
  let tick = null;
  const warningEl = h('div', { class: 'time-warning', role: 'alert', 'aria-live': 'assertive' });
  root.prepend(warningEl);
  
  if (!isStudy) {
    const update = () => {
      if (session.paused) {
        timerEl.textContent = formatTime(session.deadline - session.pausedAt);
        timerEl.classList.remove('is-low');
        return;
      }
      
      const left = session.deadline - Date.now();
      timerEl.textContent = formatTime(left);
      timerEl.classList.toggle('is-low', left < 5 * 60000);
      
      // Avisos: um por limite, mesmo que o navegador tenha atrasado o timer (aba em segundo plano)
      if (left <= 5 * 60000 && !session.warned5 && left > 0) {
        session.warned5 = true;
        session.warned10 = true;
        save();
        showWarning(t('timeWarning5'));
      } else if (left <= 10 * 60000 && left > 5 * 60000 && !session.warned10) {
        session.warned10 = true;
        save();
        showWarning(t('timeWarning10'));
      }
      
      if (left <= 0) {
        clearInterval(tick);
        submit(true);
      }
    };
    
    function showWarning(message) {
      warningEl.textContent = message;
      warningEl.classList.add('show');
      setTimeout(() => {
        warningEl.classList.remove('show');
      }, 5000);
    }
    
    update();
    tick = setInterval(update, 1000);
  }

  function onKey(event) {
    if (dialog.open || isPaused() || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof HTMLElement && event.target.closest('a, textarea, select')) return;
    const key = event.key.toLowerCase();
    if (key === 'arrowright') goTo(session.current + 1);
    else if (key === 'arrowleft') goTo(session.current - 1);
    else if (key === 'f') toggleFlag();
    else if (key.length === 1 && 'abcde'.includes(key)) {
      const q = currentQ();
      const index = LETTERS.toLowerCase().indexOf(key);
      if (index >= q[getLang()].options.length) return;
      if (isStudy && session.checked.includes(q.num)) return;
      const on = q.n > 1 ? !(session.answers[q.num] || []).includes(index) : true;
      setAnswer(q, index, on);
      renderCard();
      refreshChrome();
    }
  }
  document.addEventListener('keydown', onKey);

  renderCard();
  refreshChrome();

  return () => {
    clearInterval(tick);
    document.removeEventListener('keydown', onKey);
  };
}
