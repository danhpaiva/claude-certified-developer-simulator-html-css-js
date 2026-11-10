// Persistência local (localStorage), tolerante a falhas: modo privado/bloqueado nunca quebra o site.
import { isTrainId } from './analysis.js';
import { parseHistory } from './importer.js';

const PREFIX = 'ccdv.';
const MAX_ATTEMPTS = 200;
const TRAIN_GRACE_MS = 60 * 1000;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// Listas guardadas: se o armazenamento foi corrompido (não é lista, ou tem itens de tipo errado), vale lista limpa.
function readList(key, isItem) {
  const value = read(key, []);
  return Array.isArray(value) ? value.filter(isItem) : [];
}
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const readAttempts = () => readList('attempts', isRecord);
const readTrainIds = () => readList('trains', (id) => typeof id === 'string');

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* sem armazenamento: ignora */
  }
}

export const store = {
  getPref: (name, fallback) => read('pref.' + name, fallback),
  setPref: (name, value) => write('pref.' + name, value),

  session: (examId) => read('session.' + examId, null),
  saveSession: (examId, session) => write('session.' + examId, session),
  clearSession: (examId) => remove('session.' + examId),

  attempts: () => readAttempts(),
  attempt: (id) => readAttempts().find((a) => a.id === id) || null,
  addAttempt(attempt) {
    const list = readAttempts();
    list.unshift(attempt);
    return write('attempts', list.slice(0, MAX_ATTEMPTS));
  },
  clearAttempts() {
    remove('attempts');
    this.pruneTrains();
  },

  // Treinos: só a definição (lista de referências às questões oficiais), nunca cópias das questões.
  train: (id) => read('train.' + id, null),
  trains: () => readTrainIds().map((id) => read('train.' + id, null)).filter(Boolean),
  saveTrain(def) {
    write('train.' + def.id, def);
    write('trains', [def.id, ...readTrainIds().filter((id) => id !== def.id)]);
    this.pruneTrains(def.id);
  },
  // Apaga treinos que não têm sessão em andamento nem tentativa registrada (nada mais depende deles).
  // Treinos criados há menos de 1 minuto ficam: a sessão deles pode estar sendo aberta agora (ex.: em outra aba).
  pruneTrains(exceptId) {
    const used = new Set(readAttempts().map((a) => a.examId));
    const keep = [];
    for (const id of readTrainIds()) {
      const def = read('train.' + id, null);
      const recent = def && Date.now() - (def.createdAt || 0) < TRAIN_GRACE_MS;
      if (id === exceptId || recent || used.has(id) || read('session.' + id, null)) keep.push(id);
      else remove('train.' + id);
    }
    write('trains', keep);
  },
  
  // Exporta o histórico no formato atual: as tentativas e as definições dos treinos que elas referenciam.
  exportHistory() {
    const attempts = readAttempts();
    const used = new Set(attempts.map((a) => a.examId));
    return { version: 2, exportedAt: new Date().toISOString(), attempts, trains: this.trains().filter((def) => used.has(def.id)) };
  },

  // Importa um histórico vindo de arquivo (não confiável): valida tipos e faixas, descarta duplicatas
  // e tentativas de treino sem a definição do treino. Devolve contadores para a tela informar ao usuário.
  importAttempts(payload) {
    const parsed = parseHistory(payload);
    if (!parsed.ok) return { ok: false, imported: 0, duplicates: 0, invalid: 0, dropped: 0 };

    const current = readAttempts();
    const existingIds = new Set(current.map((a) => a.id));
    const importedTrains = new Map(parsed.trains.map((def) => [def.id, def]));
    const toImport = [];
    let duplicates = 0;
    let invalid = parsed.invalid;

    for (const attempt of parsed.attempts) {
      if (existingIds.has(attempt.id)) {
        duplicates += 1;
        continue;
      }
      if (isTrainId(attempt.examId) && !importedTrains.has(attempt.examId) && !read('train.' + attempt.examId, null)) {
        invalid += 1; // treino sem definição: não haveria como abrir o resultado
        continue;
      }
      existingIds.add(attempt.id);
      toImport.push(attempt);
    }

    const merged = [...toImport, ...current].sort((a, b) => b.finishedAt - a.finishedAt).slice(0, MAX_ATTEMPTS);
    write('attempts', merged);
    const kept = new Set(merged.map((a) => a.id));
    const retained = toImport.filter((a) => kept.has(a.id));

    // definições de treino só depois de gravar as tentativas (a limpeza apaga treino sem tentativa)
    for (const attempt of retained) {
      if (isTrainId(attempt.examId) && !read('train.' + attempt.examId, null)) this.saveTrain(importedTrains.get(attempt.examId));
    }
    return { ok: true, imported: retained.length, duplicates, invalid, dropped: toImport.length - retained.length };
  },
};
