// Carregamento (com cache em memória) do manifesto e dos simulados, oficiais e de treino.
import { store } from './store.js';
import { buildTrainExam, isTrainId } from './analysis.js';

// Erro "o recurso não existe" (vira a tela "não encontrado"). Falha de rede, 5xx e JSON quebrado NÃO são isso:
// são "não foi possível carregar" e o usuário pode tentar de novo.
const notFound = (message) => Object.assign(new Error(message), { notFound: true });

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw Object.assign(new Error(`${path}: ${response.status}`), { status: response.status });
  return response.json();
}

let manifestPromise = null;
const officialCache = new Map();

// Só para testes: esquece o que está em cache.
export function clearExamCaches() {
  manifestPromise = null;
  officialCache.clear();
}

export const loadManifest = () =>
  (manifestPromise ||= fetchJson('data/exams.json').catch((error) => {
    manifestPromise = null; // falha não fica em cache: a próxima tentativa baixa de novo
    throw error;
  }));

export function loadOfficialExam(id) {
  if (!/^DIA\d+-SIM\d+$/.test(id)) return Promise.reject(notFound('not found'));
  if (!officialCache.has(id)) {
    officialCache.set(
      id,
      fetchJson(`data/exams/${id}.json`).catch((error) => {
        officialCache.delete(id); // idem: sem cache de falha
        throw error.status === 404 ? Object.assign(error, { notFound: true }) : error;
      }),
    );
  }
  return officialCache.get(id);
}

// Todos os simulados do manifesto, indexados por id (os que falharem ficam de fora).
export async function loadAllExams(manifest) {
  const list = await Promise.all(manifest.exams.map((e) => loadOfficialExam(e.id).catch(() => null)));
  return Object.fromEntries(list.filter(Boolean).map((exam) => [exam.id, exam]));
}

// Simulado oficial ou treino (remontado a partir da definição guardada no navegador).
// Um treino aproveita as questões dos simulados que ainda existem; se nenhuma existir, é "não encontrado".
// Já uma falha de rede ao baixar um simulado de origem é propagada ("não foi possível carregar").
export async function loadExam(id) {
  if (!isTrainId(id)) return loadOfficialExam(id);
  const def = store.train(id);
  if (!def) throw notFound('train not found');
  const sourceIds = [...new Set(def.refs.map(([examId]) => examId))];
  const loaded = (
    await Promise.all(
      sourceIds.map((examId) =>
        loadOfficialExam(examId).catch((error) => {
          if (error.notFound) return null; // simulado de origem removido: segue com os que existem
          throw error; // falha de rede/servidor: não esconder, o usuário tenta de novo
        }),
      ),
    )
  ).filter(Boolean);
  const exam = buildTrainExam(def, Object.fromEntries(loaded.map((source) => [source.id, source])));
  if (!exam.questions.length) throw notFound('train without available questions');
  return exam;
}
