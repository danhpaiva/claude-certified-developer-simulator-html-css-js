// Roteador sem DOM: interpreta o hash da URL, carrega os dados de cada tela e entrega o resultado a quem desenha.
// Tudo que toca em página, rede ou armazenamento chega por parâmetro (injeção), então dá para testar sem navegador.

// "#/exam/DIA1-SIM2?mode=study" -> { parts: ['exam', 'DIA1-SIM2'], params: URLSearchParams }
export function parseHash(hash) {
  const raw = String(hash ?? '').replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?'); // um segundo "?" na query é ignorado, como antes
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(query) };
}

// Qual tela o hash pede. Qualquer coisa desconhecida (ou sem id) cai na home.
export function resolveRoute(hash) {
  const { parts, params } = parseHash(hash);
  const [first, id] = parts;
  if (first === 'train') return { name: 'train' };
  if (first === 'stats') return { name: 'stats' };
  if (first === 'exam' && id) return { name: 'exam', id, mode: params.get('mode') === 'study' ? 'study' : 'exam' };
  if (first === 'result' && id) return { name: 'result', id, timeUp: params.has('timeup') };
  return { name: 'home' };
}

// deps:
//   loadManifest(), loadExam(id)  -> Promise  (rejeitam com { notFound: true } quando o recurso não existe)
//   getAttempt(id)                -> tentativa ou null
//   showLoading(), showError(kind: 'notFound' | 'loadError')
//   show(view)                    -> opcionalmente devolve uma função dispose(), chamada ao sair da tela
// A navegação mais recente sempre vence: respostas atrasadas de navegações antigas são descartadas.
export function createRouter({ loadManifest, loadExam, getAttempt, showLoading, showError, show }) {
  let token = 0;
  let dispose = null;

  async function navigate(hash) {
    const mine = ++token;
    if (dispose) dispose();
    dispose = null;
    showLoading();
    try {
      const route = resolveRoute(hash);
      let view;
      if (route.name === 'exam') {
        const [exam, manifest] = await Promise.all([loadExam(route.id), loadManifest()]);
        view = { name: 'exam', exam, manifest, mode: route.mode };
      } else if (route.name === 'result') {
        const attempt = getAttempt(route.id);
        if (!attempt) view = { name: 'missingAttempt' };
        else {
          const [exam, manifest] = await Promise.all([loadExam(attempt.examId), loadManifest()]);
          view = { name: 'result', exam, manifest, attempt, timeUp: route.timeUp };
        }
      } else {
        view = { name: route.name, manifest: await loadManifest() }; // home, train, stats
      }
      if (mine !== token) return; // chegou depois de outra navegação: descarta
      dispose = show(view) || null;
    } catch (error) {
      if (mine !== token) return;
      showError(error && error.notFound ? 'notFound' : 'loadError');
    }
  }

  return { navigate };
}
