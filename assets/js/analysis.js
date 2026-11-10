// Lógica pura (sem DOM) de treino e estatísticas, separada das telas para poder ser testada.
import { isCorrect } from './scoring.js';

export const TRAIN_ID_PATTERN = /^TRAIN-[a-z0-9]+$/;
export const isTrainId = (id) => typeof id === 'string' && TRAIN_ID_PATTERN.test(id);

const findQuestion = (exam, num) => exam?.questions.find((q) => q.num === num) ?? null;

// Um treino é guardado só como lista de referências [idDoSimulado, númeroDaQuestão].
// O exame sintético é remontado a partir dos simulados oficiais (nada de copiar questões).
// A numeração segue a posição na lista (1..N), pois é nela que as respostas ficam indexadas.
export function buildTrainExam(def, examsById) {
  const questions = [];
  def.refs.forEach(([examId, num], i) => {
    const source = findQuestion(examsById[examId], num);
    if (source) questions.push({ ...source, num: i + 1, sourceExamId: examId, sourceNum: num });
  });
  return { id: def.id, day: 'TREINO', set: def.title, minutes: 120, total: questions.length, questions };
}

// Para uma tentativa, devolve as questões oficiais respondidas, seja ela de um simulado ou de um treino.
export function resolveAttempt(attempt, examsById, getTrainDef) {
  const answers = attempt.answers || {};
  if (isTrainId(attempt.examId)) {
    const def = getTrainDef(attempt.examId);
    if (!def) return [];
    return def.refs.flatMap(([examId, num], i) => {
      const question = findQuestion(examsById[examId], num);
      return question ? [{ key: `${examId}#${num}`, question, given: answers[i + 1] || [] }] : [];
    });
  }
  const exam = examsById[attempt.examId];
  if (!exam) return [];
  return exam.questions.map((question) => ({ key: `${exam.id}#${question.num}`, question, given: answers[question.num] || [] }));
}

// Resultado MAIS RECENTE de cada questão respondida (true = acertou). Acertar depois de errar tira a questão da lista.
export function latestOutcomes(attempts, examsById, getTrainDef) {
  const outcomes = new Map();
  const newestFirst = [...attempts].sort((a, b) => b.finishedAt - a.finishedAt);
  for (const attempt of newestFirst) {
    for (const { key, question, given } of resolveAttempt(attempt, examsById, getTrainDef)) {
      if (!given.length || outcomes.has(key)) continue;
      outcomes.set(key, isCorrect(question, given));
    }
  }
  return outcomes;
}

export const wrongKeys = (outcomes) => [...outcomes].filter(([, ok]) => !ok).map(([key]) => key);

// Acertos por domínio somando todas as tentativas (simulados e treinos).
export function domainTotals(attempts, examsById, getTrainDef) {
  const totals = {};
  for (const attempt of attempts) {
    for (const { question, given } of resolveAttempt(attempt, examsById, getTrainDef)) {
      const row = (totals[question.domain] ||= { correct: 0, total: 0 });
      row.total += 1;
      if (isCorrect(question, given)) row.correct += 1;
    }
  }
  return totals;
}

// Pontos fracos = onde mais nota está em jogo: (1 − acerto) × peso do domínio no exame.
// Domínio com 100% de acerto nunca entra; domínio de peso alto e acerto baixo vem primeiro.
export function weakestDomains(rows, limit = 3) {
  return rows
    .filter((r) => r.total > 0 && r.avg < 1)
    .map((r) => ({ ...r, lost: (1 - r.avg) * r.weight }))
    .sort((a, b) => b.lost - a.lost)
    .slice(0, limit);
}

// Linhas da tabela por domínio: só domínios com questões respondidas, na ordem do manifesto.
// avg = acertos / total (0 quando total é 0, nunca NaN).
export function domainRows(domains, totals) {
  return Object.entries(domains || {})
    .map(([domain, info]) => {
      const { correct = 0, total = 0 } = totals[domain] || {};
      return { domain, name: info.name, weight: info.weight, correct, total, avg: total ? correct / total : 0 };
    })
    .filter((row) => row.total > 0);
}

// Números do topo da página: quantidade, média e melhor percentual (0 quando não há tentativas).
export function overallStats(attempts) {
  const percents = attempts.map((a) => a.percent).filter((p) => Number.isFinite(p));
  const count = attempts.length;
  return {
    count,
    avg: percents.length ? percents.reduce((sum, p) => sum + p, 0) / percents.length : 0,
    best: percents.length ? Math.max(...percents) : 0,
  };
}
