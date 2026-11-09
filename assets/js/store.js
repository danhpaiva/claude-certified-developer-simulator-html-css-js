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
  clearAttempts: () => remove('attempts'),
};
