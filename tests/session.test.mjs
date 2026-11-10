import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MINUTE_MS, createSession, hydrateSession, isPaused, remainingMs, isExpired, togglePause, elapsedMs, checkWarning,
} from '../assets/js/session.js';

const T0 = 1_700_000_000_000; // instante de início inventado
const at = (minutes, seconds = 0) => T0 + minutes * MINUTE_MS + seconds * 1000;
const exam = () => createSession({ mode: 'exam', minutes: 120, now: T0 });
const study = () => createSession({ mode: 'study', minutes: 120, now: T0 });

// ---------- criação e hidratação ----------
test('createSession: prova tem prazo de N minutos; estudo nunca tem prazo', () => {
  const s = exam();
  assert.equal(s.deadline, T0 + 120 * MINUTE_MS);
  assert.deepEqual([s.paused, s.pausedAt, s.totalPausedMs, s.warned10, s.warned5, s.current], [false, null, 0, false, false, 0]);
  assert.equal(study().deadline, null);
  assert.equal(createSession({ mode: 'qualquer-coisa', minutes: 120, now: T0 }).mode, 'study'); // modo desconhecido nunca vira prova
});

test('hydrateSession: sessão antiga, sem campos de pausa, continua funcionando', () => {
  const old = { mode: 'exam', startedAt: T0, deadline: T0 + 120 * MINUTE_MS, answers: { 1: [0] }, flags: [3], checked: [], current: 4 };
  const s = hydrateSession(old, { mode: 'exam', minutes: 120 });
  assert.deepEqual([s.paused, s.pausedAt, s.totalPausedMs, s.warned10, s.warned5], [false, null, 0, false, false]);
  assert.deepEqual([s.answers, s.flags, s.current], [{ 1: [0] }, [3], 4]);
});

test('hydrateSession: sessão de ESTUDO nunca ganha prazo, nem se o arquivo trouxer um deadline', () => {
  const s = hydrateSession({ mode: 'study', startedAt: T0, deadline: T0 + 1000, paused: true, pausedAt: T0 + 5 }, { mode: 'exam', minutes: 120 });
  assert.equal(s.mode, 'study'); // o modo gravado manda, não o pedido da URL
  assert.equal(s.deadline, null);
  assert.equal(s.paused, false); // estudo não pausa
  assert.equal(s.pausedAt, null);
});

test('hydrateSession: prova sem deadline recebe um calculado a partir do início', () => {
  assert.equal(hydrateSession({ mode: 'exam', startedAt: T0 }, { mode: 'exam', minutes: 90 }).deadline, T0 + 90 * MINUTE_MS);
});

test('hydrateSession: "pausado" sem instante de pausa é inconsistente e vira não pausado', () => {
  const s = hydrateSession({ mode: 'exam', startedAt: T0, deadline: at(120), paused: true, pausedAt: null }, { mode: 'exam', minutes: 120 });
  assert.deepEqual([s.paused, s.pausedAt], [false, null]);
});

test('hydrateSession: lixo (null, tipos errados) vira uma sessão válida e não lança erro', () => {
  for (const raw of [null, undefined, 42, 'x', [], { mode: 5, startedAt: 'ontem', answers: [], flags: 'a', current: -3, totalPausedMs: -10, warned10: 'sim' }]) {
    const s = hydrateSession(raw, { mode: 'exam', minutes: 120 });
    assert.equal(s.mode, 'exam');
    assert.equal(Number.isFinite(s.deadline), true);
    assert.deepEqual([s.answers, s.flags, s.checked, s.current, s.totalPausedMs, s.warned10, s.warned5], [{}, [], [], 0, 0, false, false]);
  }
});

test('hydrateSession: não altera o objeto recebido', () => {
  const raw = { mode: 'study', startedAt: T0, deadline: 5, answers: { 1: [0] } };
  const copy = structuredClone(raw);
  hydrateSession(raw, { mode: 'study', minutes: 120 });
  assert.deepEqual(raw, copy);
});

// ---------- tempo restante e prazo vencido ----------
test('remainingMs: corre com o relógio; estudo e sessão sem prazo devolvem null', () => {
  assert.equal(remainingMs(exam(), at(0)), 120 * MINUTE_MS);
  assert.equal(remainingMs(exam(), at(30)), 90 * MINUTE_MS);
  assert.equal(remainingMs(study(), at(30)), null);
  assert.equal(remainingMs({ ...exam(), deadline: undefined }, at(1)), null);
  assert.equal(remainingMs({ ...study(), deadline: at(10) }, at(1)), null); // estudo ignora até um deadline perdido no arquivo
});

test('isExpired: antes, exatamente no prazo e depois; estudo nunca vence', () => {
  const s = exam();
  assert.equal(isExpired(s, at(119, 59)), false);
  assert.equal(isExpired(s, at(120)), true);
  assert.equal(isExpired(s, at(500)), true);
  assert.equal(isExpired(study(), at(500)), false);
});

test('prazo vencido ao reabrir: a sessão carregada já está vencida (finaliza na hora)', () => {
  const saved = JSON.parse(JSON.stringify(exam())); // o que foi para o localStorage
  const reopened = hydrateSession(saved, { mode: 'exam', minutes: 120 });
  assert.equal(isExpired(reopened, at(121)), true);
  assert.equal(checkWarning(reopened, at(121)).warning, null); // vencida não "avisa", finaliza
});

// ---------- pausa e retomada ----------
test('pausar congela o tempo restante', () => {
  const s = togglePause(exam(), at(10));
  assert.equal(isPaused(s), true);
  assert.equal(remainingMs(s, at(10)), 110 * MINUTE_MS);
  assert.equal(remainingMs(s, at(50)), 110 * MINUTE_MS); // 40 min depois continua igual
});

test('retomar estende o prazo EXATAMENTE pelo tempo pausado', () => {
  const paused = togglePause(exam(), at(10));
  const resumed = togglePause(paused, at(25, 30)); // ficou 15 min 30 s pausado
  assert.equal(isPaused(resumed), false);
  assert.equal(resumed.pausedAt, null);
  assert.equal(resumed.totalPausedMs, 15 * MINUTE_MS + 30_000);
  assert.equal(resumed.deadline, exam().deadline + 15 * MINUTE_MS + 30_000);
  assert.equal(remainingMs(resumed, at(25, 30)), 110 * MINUTE_MS); // sobra o mesmo que havia ao pausar
});

test('várias pausas se acumulam', () => {
  let s = exam();
  s = togglePause(s, at(10)); s = togglePause(s, at(15));   // 5 min
  s = togglePause(s, at(40)); s = togglePause(s, at(47));   // 7 min
  assert.equal(s.totalPausedMs, 12 * MINUTE_MS);
  assert.equal(s.deadline, at(120) + 12 * MINUTE_MS);
});

test('pausar e retomar no mesmo instante não muda nada', () => {
  const s = togglePause(togglePause(exam(), at(5)), at(5));
  assert.deepEqual(s, { ...exam(), paused: false, pausedAt: null });
});

test('relógio que anda para trás ao retomar nunca ENCURTA o prazo', () => {
  const resumed = togglePause(togglePause(exam(), at(20)), at(10)); // "agora" < instante da pausa
  assert.equal(resumed.totalPausedMs, 0);
  assert.equal(resumed.deadline, exam().deadline);
});

test('não se pausa um prazo que já venceu', () => {
  const s = exam();
  assert.equal(togglePause(s, at(120)), s);
  assert.equal(togglePause(s, at(300)), s);
});

test('modo estudo: pausar é sempre um não-fazer-nada (nunca ganha prazo nem fica pausado)', () => {
  const s = study();
  const r = togglePause(s, at(5));
  assert.equal(r, s);
  assert.deepEqual([r.paused, r.deadline], [false, null]);
  assert.equal(isPaused({ ...s, paused: true }), false);
});

test('togglePause não altera a sessão recebida (imutável)', () => {
  const s = exam();
  const frozen = structuredClone(s);
  togglePause(s, at(3));
  assert.deepEqual(s, frozen);
});

// ---------- tempo usado ----------
test('elapsedMs: sem pausa é o tempo corrido', () => {
  assert.equal(elapsedMs(exam(), at(37)), 37 * MINUTE_MS);
});

test('elapsedMs: desconta as pausas já encerradas', () => {
  let s = togglePause(togglePause(exam(), at(10)), at(20)); // 10 min pausado
  assert.equal(elapsedMs(s, at(30)), 20 * MINUTE_MS);
});

test('elapsedMs: finalizar ENQUANTO pausado desconta a pausa em andamento', () => {
  const s = togglePause(exam(), at(10)); // pausou aos 10 min e nunca retomou
  assert.equal(elapsedMs(s, at(10)), 10 * MINUTE_MS);
  assert.equal(elapsedMs(s, at(70)), 10 * MINUTE_MS); // 60 min depois, ainda 10 min de uso
});

test('elapsedMs: pausas encerradas + pausa em andamento juntas', () => {
  let s = togglePause(togglePause(exam(), at(10)), at(15)); // 5 min pausado
  s = togglePause(s, at(30)); // pausa de novo aos 30
  assert.equal(elapsedMs(s, at(50)), 30 * MINUTE_MS - 5 * MINUTE_MS); // 30 corridos até a 2ª pausa, menos os 5 da 1ª
});

test('elapsedMs: nunca é negativo (relógio para trás) e funciona no modo estudo', () => {
  assert.equal(elapsedMs(exam(), T0 - 5000), 0);
  assert.equal(elapsedMs(study(), at(12)), 12 * MINUTE_MS);
});

test('invariante: tempo usado + tempo restante = duração total, com qualquer sequência de pausas', () => {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let round = 0; round < 200; round++) {
    let s = exam();
    let now = T0;
    for (let step = 0; step < 12; step++) {
      now += Math.floor(rnd() * 9 * MINUTE_MS) + 1000;
      if (isExpired(s, now)) break;
      if (rnd() < 0.5) s = togglePause(s, now);
      assert.equal(elapsedMs(s, now) + remainingMs(s, now), 120 * MINUTE_MS, `rodada ${round}, passo ${step}`);
    }
  }
});

// ---------- avisos de 10 e 5 minutos ----------
test('aviso de 10 min: sai uma vez só', () => {
  let s = exam();
  assert.equal(checkWarning(s, at(100)).warning, null); // faltam 20 min
  const first = checkWarning(s, at(110)); // faltam exatamente 10 min
  assert.equal(first.warning, 10);
  assert.equal(first.session.warned10, true);
  assert.equal(first.session.warned5, false);
  assert.equal(checkWarning(first.session, at(110, 1)).warning, null); // não repete
  assert.equal(checkWarning(first.session, at(114)).warning, null);
});

test('aviso de 5 min: sai uma vez só, no limite exato e depois', () => {
  let s = exam();
  const first = checkWarning(s, at(115)); // faltam exatamente 5 min
  assert.equal(first.warning, 5);
  assert.deepEqual([first.session.warned5, first.session.warned10], [true, true]);
  assert.equal(checkWarning(first.session, at(116)).warning, null);
});

test('os dois avisos, em ordem, uma vez cada, ao longo de toda a prova (simulação segundo a segundo)', () => {
  let s = exam();
  const seen = [];
  for (let t = T0; t < at(120); t += 1000) {
    const r = checkWarning(s, t);
    s = r.session;
    if (r.warning) seen.push(r.warning);
  }
  assert.deepEqual(seen, [10, 5]);
});

test('relógio que PULA (aba em segundo plano): só o aviso mais urgente sai, sem repetir o anterior', () => {
  const s = exam();
  const jump = checkWarning(s, at(117)); // foi de >10 min direto para 3 min
  assert.equal(jump.warning, 5);
  assert.equal(checkWarning(jump.session, at(117, 5)).warning, null); // o de 10 NÃO sai depois
});

test('relógio que pula direto para depois do prazo: nenhum aviso (a prova finaliza)', () => {
  assert.equal(checkWarning(exam(), at(150)).warning, null);
  assert.equal(checkWarning(exam(), at(120)).warning, null); // exatamente no prazo
});

test('reabrir a prova no meio da janela: avisa o que ainda não foi dado', () => {
  const reopened = hydrateSession({ ...exam() }, { mode: 'exam', minutes: 120 });
  assert.equal(checkWarning(reopened, at(112)).warning, 10); // faltam 8 min, o de 10 ainda não saiu
  assert.equal(checkWarning(reopened, at(116)).warning, 5);  // faltam 4 min
});

test('aviso já dado antes de fechar a aba não se repete ao reabrir', () => {
  const given = checkWarning(exam(), at(111)).session; // aviso de 10 já foi mostrado e salvo
  const saved = JSON.parse(JSON.stringify(given));
  const reopened = hydrateSession(saved, { mode: 'exam', minutes: 120 });
  assert.equal(checkWarning(reopened, at(112)).warning, null);
});

test('pausado não avisa; ao retomar, o aviso sai no instante certo (prazo estendido)', () => {
  let s = togglePause(exam(), at(112)); // faltam 8 min e pausa
  assert.equal(checkWarning(s, at(200)).warning, null);
  s = togglePause(s, at(200)); // retoma; ainda faltam 8 min
  assert.equal(checkWarning(s, at(200)).warning, 10);
});

test('estudo nunca recebe aviso', () => {
  assert.equal(checkWarning(study(), at(119)).warning, null);
});

test('checkWarning não altera a sessão recebida', () => {
  const s = exam();
  const frozen = structuredClone(s);
  checkWarning(s, at(117));
  assert.deepEqual(s, frozen);
});
