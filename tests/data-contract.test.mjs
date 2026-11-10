// Contrato dos DADOS REAIS (data/exams/*.json): rede de segurança extra, independente do validate-data.mjs.
// Se alguém (ou um gerador de questões) quebrar uma regra, o CI mostra exatamente qual questão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'exams');
const LETTERS = 'ABCDE';
const exams = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(dir, f), 'utf8')) }));
const cases = exams.flatMap((e) => e.questions.flatMap((q) => ['pt', 'en'].map((lang) => ({ where: `${e.id} Q${q.num} (${lang})`, q, lang, c: q[lang] }))));
const questions = exams.flatMap((e) => e.questions.map((q) => ({ where: `${e.id} Q${q.num}`, q })));

// Reporta TODAS as violações de uma vez, não só a primeira.
const expectNone = (violations, rule) => assert.deepEqual(violations, [], `${rule}:\n  ${violations.join('\n  ')}`);

test('há simulados reais para testar', () => {
  assert.ok(exams.length >= 4);
  assert.ok(cases.length >= 400);
});

test('o id de cada simulado bate com o nome do arquivo', () => {
  expectNone(exams.filter((e) => e.file !== `${e.id}.json`).map((e) => `${e.file} contém id ${e.id}`), 'id != arquivo');
});

// ---------- letras nas explicações ----------
// A explicação abre com "Correta (C):" / "Corretas (B) e (E):" / "Correct (A):" quando cita letras.
// As letras são remapeadas após o embaralhamento; se o remapeamento falhar, a explicação mente para o aluno.
const LEAD = /^(?:Corret[ao]s?|Correct)\s*((?:\([A-E]\)|[A-E])(?:[,\s]+(?:e|and)?\s*(?:\([A-E]\)|[A-E]))*)\s*:/;
const lettersIn = (text) => [...text.matchAll(/[A-E]/g)].map((m) => LETTERS.indexOf(m[0]));
const sameSet = (a, b) => [...a].sort().join() === [...b].sort().join();

test('explicação que abre com "Correta (X)" cita exatamente a(s) letra(s) da resposta', () => {
  const bad = [];
  let cited = 0;
  for (const { where, q, c } of cases) {
    const lead = c.explanation.match(LEAD);
    if (!lead) continue;
    cited += 1;
    const letters = lettersIn(lead[1]);
    if (!sameSet(letters, q.answer)) bad.push(`${where}: cita ${letters.map((i) => LETTERS[i])} mas a resposta é ${q.answer.map((i) => LETTERS[i])}`);
  }
  assert.ok(cited > 100, `deveria haver muitas explicações com letra (achei ${cited}); o padrão de abertura mudou?`);
  expectNone(bad, 'letra citada != resposta');
});

test('explicação nunca chama de errada (ou de correta) uma letra do jeito contrário', () => {
  // "B está errada" / "B is wrong" / "B) ..." (padrão de refutação) não pode apontar para uma alternativa correta.
  const WRONG = /(?:\b([A-E])\)|\(([A-E])\))\s|\b([A-E])\s+(?:está errada|é falsa|is wrong|is incorrect|is false)/g;
  const bad = [];
  let refuted = 0;
  for (const { where, q, c } of cases) {
    const lead = c.explanation.match(LEAD);
    const rest = lead ? c.explanation.slice(lead[0].length) : c.explanation;
    if (!lead) continue; // sem cabeçalho de letra, não dá para saber o que o texto chama de correta
    for (const m of rest.matchAll(WRONG)) {
      refuted += 1;
      const index = LETTERS.indexOf(m[1] || m[2] || m[3]);
      if (q.answer.includes(index)) bad.push(`${where}: refuta a letra ${LETTERS[index]}, que é correta`);
    }
  }
  assert.ok(refuted > 200, `deveria haver muitas refutações por letra (achei ${refuted}); o padrão mudou?`);
  expectNone(bad, 'refutação aponta para alternativa correta');
});

test('letras citadas existem (nunca uma letra além do número de alternativas)', () => {
  const bad = [];
  for (const { where, c } of cases) {
    const lead = c.explanation.match(LEAD);
    if (lead && lettersIn(lead[1]).some((i) => i >= c.options.length)) bad.push(where);
  }
  expectNone(bad, 'letra fora do intervalo');
});

// ---------- alternativas ----------
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

test('nenhuma alternativa repetida dentro da mesma questão', () => {
  const bad = cases.filter(({ c }) => new Set(c.options.map(norm)).size !== c.options.length).map(({ where }) => where);
  expectNone(bad, 'alternativas repetidas');
});

test('alternativas não são iguais ao enunciado nem começam com a letra ("A) ...")', () => {
  const bad = [];
  for (const { where, c } of cases) {
    if (c.options.some((o) => norm(o) === norm(c.stem))) bad.push(`${where}: alternativa igual ao enunciado`);
    if (c.options.some((o) => /^\(?[A-E][).]\s/.test(o))) bad.push(`${where}: alternativa já começa com letra (a tela também põe a letra)`);
  }
  expectNone(bad, 'alternativa mal formada');
});

// ---------- enunciados ----------
test('nenhum enunciado igual entre simulados (nem dentro do mesmo), em PT e em EN', () => {
  const bad = [];
  for (const lang of ['pt', 'en']) {
    const seen = new Map();
    for (const e of exams) {
      for (const q of e.questions) {
        const key = norm(q[lang].stem);
        if (seen.has(key)) bad.push(`${e.id} Q${q.num} (${lang}) repete ${seen.get(key)}`);
        else seen.set(key, `${e.id} Q${q.num}`);
      }
    }
  }
  expectNone(bad, 'enunciado duplicado');
});

// ---------- blocos de código ----------
const count = (text, token) => text.split(token).length - 1;
const allText = (c) => [c.stem, ...c.options, c.explanation];

test('PT e EN têm o mesmo número de blocos de código (cercas ```) em enunciado, alternativas e explicação', () => {
  const bad = [];
  for (const { where, q } of questions) {
    const parts = (lang) => allText(q[lang]).map((text) => count(text, '```'));
    if (parts('pt').join() !== parts('en').join()) bad.push(`${where}: PT ${parts('pt')} vs EN ${parts('en')}`);
  }
  expectNone(bad, 'blocos de código diferentes entre PT e EN');
});

test('cercas ``` sempre fecham e crases de trecho (`) vêm em pares', () => {
  const bad = [];
  for (const { where, c } of cases) {
    for (const text of allText(c)) {
      if (count(text, '```') % 2) bad.push(`${where}: bloco de código sem fechar`);
      else if (count(text.replace(/```[\s\S]*?```/g, ''), '`') % 2) bad.push(`${where}: crase sem par em "${text.slice(0, 40)}"`);
    }
  }
  expectNone(bad, 'crases desbalanceadas');
});

// ---------- fontes e metadados ----------
test('todo source é uma URL HTTPS válida (nunca http:, javascript: ou caminho local)', () => {
  const bad = [];
  for (const { where, q } of questions) {
    try {
      const url = new URL(q.source);
      if (url.protocol !== 'https:') bad.push(`${where}: ${q.source}`);
    } catch {
      bad.push(`${where}: URL inválida "${q.source}"`);
    }
  }
  expectNone(bad, 'source não HTTPS');
});

test('estrutura: n = nº de respostas; 4 alternativas se única, 5 se múltipla; PT e EN alinhados', () => {
  const bad = [];
  for (const { where, q } of questions) {
    if (q.n !== q.answer.length) bad.push(`${where}: n=${q.n} e ${q.answer.length} respostas`);
    const expected = q.n === 1 ? 4 : 5;
    if (q.pt.options.length !== expected || q.en.options.length !== expected) bad.push(`${where}: nº de alternativas != ${expected}`);
    if (q.answer.some((i) => !Number.isInteger(i) || i < 0 || i >= expected)) bad.push(`${where}: resposta fora do intervalo`);
  }
  expectNone(bad, 'estrutura');
});

test('nenhum texto tem espaços sobrando nas pontas nem marcadores « »', () => {
  const bad = [];
  for (const { where, c } of cases) {
    for (const text of allText(c)) {
      if (text !== text.trim()) bad.push(`${where}: espaço sobrando nas pontas`);
      if (/[«»]/.test(text)) bad.push(`${where}: marcador « » sobrando`);
    }
  }
  expectNone(bad, 'texto sujo');
});
