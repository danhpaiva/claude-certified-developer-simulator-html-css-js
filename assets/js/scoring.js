export const LETTERS = 'ABCDE';
// Referência aproximada (não oficial): o exame real usa nota escalada, corte 720 em 100–1000.
export const PASS_REFERENCE = 0.72;

// Acerta somente com o conjunto exato de alternativas corretas (sem nota parcial).
export function isCorrect(question, given) {
  const a = [...(given || [])].sort((x, y) => x - y);
  const b = [...question.answer].sort((x, y) => x - y);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function grade(exam, answers) {
  const byDomain = {};
  let correct = 0;
  let answered = 0;
  const items = exam.questions.map((q) => {
    const given = answers[q.num] || [];
    const ok = isCorrect(q, given);
    if (given.length) answered += 1;
    if (ok) correct += 1;
    const d = (byDomain[q.domain] ||= { correct: 0, total: 0 });
    d.total += 1;
    if (ok) d.correct += 1;
    return { num: q.num, domain: q.domain, skill: q.skill, ok, given, unanswered: given.length === 0 };
  });
  const total = exam.questions.length;
  return { correct, total, answered, percent: total ? correct / total : 0, byDomain, items };
}

export const lettersOf = (indexes) => [...indexes].sort((a, b) => a - b).map((i) => LETTERS[i]).join(', ');
