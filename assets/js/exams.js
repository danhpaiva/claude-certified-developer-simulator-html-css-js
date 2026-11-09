// Carregamento (com cache em memória) do manifesto e dos simulados, oficiais e de treino.
import { store } from './store.js';
import { buildTrainExam, isTrainId } from './analysis.js';

const notFound = (message) => Object.assign(new Error(message), { notFound: true });

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

let manifestPromise = null;
export const loadManifest = () =>
  (manifestPromise ||= fetchJson('data/exams.json').catch((error) => {
    manifestPromise = null;
    throw error;
  }));

const officialCache = new Map();
export function loadOfficialExam(id) {
  if (!/^DIA\d+-SIM\d+$/.test(id)) return Promise.reject(notFound('not found'));
  if (!officialCache.has(id)) {
    officialCache.set(
      id,
      fetchJson(`data/exams/${id}.json`).catch((error) => {
        officialCache.delete(id);
        throw Object.assign(error, { notFound: true });
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
export async function loadExam(id) {
  if (!isTrainId(id)) return loadOfficialExam(id);
  const def = store.train(id);
  if (!def) throw notFound('train not found');
  const sourceIds = [...new Set(def.refs.map(([examId]) => examId))];
  const loaded = await Promise.all(sourceIds.map((examId) => loadOfficialExam(examId)));
  return buildTrainExam(def, Object.fromEntries(loaded.map((exam) => [exam.id, exam])));
}
