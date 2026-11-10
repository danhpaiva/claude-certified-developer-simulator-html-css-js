// Lógica pura da sessão de prova e do cronômetro (sem DOM, sem relógio próprio, sem armazenamento).
// Todas as funções recebem "now" (ms) e devolvem um NOVO objeto: nunca alteram o que receberam.
// Assim o comportamento do tempo (pausa, prazo, avisos) pode ser testado com relógios inventados.

export const MINUTE_MS = 60 * 1000;
export const WARN_10_MS = 10 * MINUTE_MS;
export const WARN_5_MS = 5 * MINUTE_MS;

const isTimed = (session) => session.mode === 'exam'; // só o modo prova tem prazo (o estudo não)
const finite = (value) => typeof value === 'number' && Number.isFinite(value);

export function createSession({ mode, minutes, now }) {
  const timed = mode === 'exam';
  return {
    mode: timed ? 'exam' : 'study',
    startedAt: now,
    deadline: timed ? now + minutes * MINUTE_MS : null,
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
}

// Sessões guardadas por versões antigas do site (sem campos de pausa) ou corrompidas ficam utilizáveis:
// preenche o que falta, descarta tipos inválidos e garante que o modo estudo NUNCA tenha prazo.
export function hydrateSession(raw, { mode, minutes }) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const sessionMode = source.mode === 'exam' || source.mode === 'study' ? source.mode : mode === 'exam' ? 'exam' : 'study';
  const startedAt = finite(source.startedAt) ? source.startedAt : 0;
  const timed = sessionMode === 'exam';
  const paused = timed && source.paused === true && finite(source.pausedAt); // "pausado" sem instante de pausa é inconsistente
  return {
    mode: sessionMode,
    startedAt,
    deadline: timed ? (finite(source.deadline) ? source.deadline : startedAt + minutes * MINUTE_MS) : null,
    answers: source.answers && typeof source.answers === 'object' && !Array.isArray(source.answers) ? source.answers : {},
    flags: Array.isArray(source.flags) ? source.flags : [],
    checked: Array.isArray(source.checked) ? source.checked : [],
    current: Number.isInteger(source.current) && source.current >= 0 ? source.current : 0,
    paused,
    pausedAt: paused ? source.pausedAt : null,
    totalPausedMs: finite(source.totalPausedMs) && source.totalPausedMs > 0 ? source.totalPausedMs : 0,
    warned10: source.warned10 === true,
    warned5: source.warned5 === true,
  };
}

export const isPaused = (session) => isTimed(session) && session.paused === true;

// Tempo restante em ms (pode ser <= 0 depois do prazo). null quando não há prazo (modo estudo).
// Pausado: o relógio fica congelado no instante da pausa.
export function remainingMs(session, now) {
  if (!isTimed(session) || !finite(session.deadline)) return null;
  const reference = isPaused(session) && finite(session.pausedAt) ? session.pausedAt : now;
  return session.deadline - reference;
}

export function isExpired(session, now) {
  const left = remainingMs(session, now);
  return left !== null && left <= 0;
}

// Pausa ou retoma. Ao retomar, o prazo é empurrado exatamente pelo tempo que ficou pausado.
export function togglePause(session, now) {
  if (!isTimed(session)) return session; // estudo não tem cronômetro: nada a pausar
  if (!isPaused(session)) {
    if (isExpired(session, now)) return session; // não dá para "congelar" um prazo que já venceu
    return { ...session, paused: true, pausedAt: now };
  }
  const pausedFor = Math.max(0, now - (finite(session.pausedAt) ? session.pausedAt : now)); // relógio que anda para trás não encurta o prazo
  return {
    ...session,
    paused: false,
    pausedAt: null,
    totalPausedMs: (session.totalPausedMs || 0) + pausedFor,
    deadline: session.deadline + pausedFor,
  };
}

// Tempo realmente usado: desconta as pausas já encerradas e a pausa em andamento (ex.: finalizou pausado).
export function elapsedMs(session, now) {
  const ongoing = isPaused(session) && finite(session.pausedAt) ? Math.max(0, now - session.pausedAt) : 0;
  return Math.max(0, now - session.startedAt - (session.totalPausedMs || 0) - ongoing);
}

// Aviso de tempo a exibir agora (10 ou 5 minutos) e a sessão com os avisos já marcados como dados.
// Cada aviso sai UMA vez. Se o relógio pular (aba em segundo plano), só o aviso mais urgente sai
// e o anterior é considerado entregue.
export function checkWarning(session, now) {
  const left = remainingMs(session, now);
  if (left === null || isPaused(session) || left <= 0) return { session, warning: null };
  if (left <= WARN_5_MS && !session.warned5) return { session: { ...session, warned5: true, warned10: true }, warning: 5 };
  if (left <= WARN_10_MS && left > WARN_5_MS && !session.warned10) return { session: { ...session, warned10: true }, warning: 10 };
  return { session, warning: null };
}
