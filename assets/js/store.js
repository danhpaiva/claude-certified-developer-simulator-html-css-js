// Persistência local (localStorage), tolerante a falhas: modo privado/bloqueado nunca quebra o site.
const PREFIX = 'ccdv.';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

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

  attempts: () => read('attempts', []),
  attempt: (id) => read('attempts', []).find((a) => a.id === id) || null,
  addAttempt(attempt) {
    const list = read('attempts', []);
    list.unshift(attempt);
    return write('attempts', list.slice(0, 200));
  },
  clearAttempts() {
    remove('attempts');
    this.pruneTrains();
  },

  // Treinos: só a definição (lista de referências às questões oficiais), nunca cópias das questões.
  train: (id) => read('train.' + id, null),
  trains: () => read('trains', []).map((id) => read('train.' + id, null)).filter(Boolean),
  saveTrain(def) {
    write('train.' + def.id, def);
    write('trains', [def.id, ...read('trains', []).filter((id) => id !== def.id)]);
    this.pruneTrains(def.id);
  },
  // Apaga treinos que não têm sessão em andamento nem tentativa registrada (nada mais depende deles).
  pruneTrains(exceptId) {
    const used = new Set(read('attempts', []).map((a) => a.examId));
    const keep = [];
    for (const id of read('trains', [])) {
      if (id === exceptId || used.has(id) || read('session.' + id, null)) keep.push(id);
      else remove('train.' + id);
    }
    write('trains', keep);
  },
  
  importAttempts(newAttempts) {
    if (!Array.isArray(newAttempts)) return { imported: 0, duplicates: 0 };
    
    const current = read('attempts', []);
    const existingIds = new Set(current.map((a) => a.id));
    const toImport = [];
    let duplicates = 0;
    
    // Valida e filtra duplicatas
    for (const attempt of newAttempts) {
      if (!attempt.id || !attempt.examId || !attempt.finishedAt) continue;
      if (existingIds.has(attempt.id)) {
        duplicates++;
        continue;
      }
      toImport.push(attempt);
    }
    
    // Mescla e ordena por data (mais recentes primeiro)
    const merged = [...toImport, ...current]
      .sort((a, b) => b.finishedAt - a.finishedAt)
      .slice(0, 200);
    
    write('attempts', merged);
    
    return { imported: toImport.length, duplicates };
  },
};
