import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ORIGIN = 'https://site.test';
const baseSource = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

// Executa o sw.js de verdade num ambiente simulado: cache em memória, rede controlável e eventos.
function boot({ version = 'v9', precache = ['./', './index.html', './assets/js/main.js', './data/exams.json'] } = {}) {
  const source = baseSource
    .replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = '${version}';`)
    .replace('const PRECACHE = [];', `const PRECACHE = ${JSON.stringify(precache)};`);

  const listeners = {};
  const stores = new Map(); // nome do cache -> Map(url -> Response)
  const net = { online: true, calls: [], files: {} };
  const norm = (input, ignoreSearch) => {
    const url = new URL(typeof input === 'string' ? input : input.url, ORIGIN + '/');
    if (ignoreSearch) url.search = '';
    return url.href;
  };

  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(request, options = {}) {
          const wanted = norm(request, options.ignoreSearch);
          for (const [key, value] of store) if (norm(key, options.ignoreSearch) === wanted) return value.clone();
          return undefined;
        },
        async put(request, response) {
          store.set(norm(request), response);
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
  };

  async function fetchMock(input, init = {}) {
    const request = input instanceof Request ? input : new Request(new URL(input, ORIGIN + '/'), init);
    net.calls.push({ url: new URL(request.url).pathname + new URL(request.url).search, cache: init.cache ?? request.cache });
    if (!net.online) throw new TypeError('Failed to fetch');
    const path = new URL(request.url).pathname;
    const body = net.files[path];
    return body === undefined ? new Response('nope', { status: 404 }) : new Response(body, { status: 200 });
  }

  const self = {
    location: { origin: ORIGIN, href: ORIGIN + '/sw.js' },
    addEventListener: (type, fn) => (listeners[type] = fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  vm.runInNewContext(source, { self, caches, fetch: fetchMock, Request, Response, URL, Error, Promise, console });

  async function dispatch(type, extra = {}) {
    const pending = [];
    const event = { waitUntil: (p) => pending.push(p), respondWith: (p) => (event.response = p), ...extra };
    listeners[type](event);
    await Promise.all(pending);
    return event;
  }
  async function request(url, { mode = 'cors', method = 'GET', headers = {}, origin = ORIGIN } = {}) {
    const req = new Request(origin + url, { method, headers });
    const event = await dispatch('fetch', { request: Object.defineProperty(req, 'mode', { value: mode }) });
    return { responded: event.response !== undefined, text: event.response ? await (await event.response).text() : null };
  }
  return { net, stores, dispatch, request, cacheName: `ccdv-${version}` };
}

test('install: pré-cacheia tudo com cache:reload (ignora o cache HTTP)', async () => {
  const sw = boot();
  sw.net.files = { '/': 'home', '/index.html': 'home', '/assets/js/main.js': 'js', '/data/exams.json': '{}' };
  await sw.dispatch('install');
  assert.equal(sw.stores.get('ccdv-v9').size, 4);
  assert.ok(sw.net.calls.every((c) => c.cache === 'reload'));
});

test('install: falha se algum arquivo do pré-cache não existir (o SW novo não ativa pela metade)', async () => {
  const sw = boot();
  sw.net.files = { '/index.html': 'home' }; // faltam os demais
  await assert.rejects(sw.dispatch('install'));
});

test('pedido versionado da MESMA versão: vem do cache, sem rede', async () => {
  const sw = boot();
  sw.net.files = { '/': 'h', '/index.html': 'h', '/assets/js/main.js': 'js-v9', '/data/exams.json': '{}' };
  await sw.dispatch('install');
  sw.net.calls.length = 0;
  const res = await sw.request('/assets/js/main.js?v=v9');
  assert.equal(res.text, 'js-v9');
  assert.equal(sw.net.calls.length, 0);
});

test('pedido versionado de OUTRA versão: vai à rede (index.html novo nunca recebe JS antigo)', async () => {
  const sw = boot();
  sw.net.files = { '/': 'h', '/index.html': 'h', '/assets/js/main.js': 'js-NOVO', '/data/exams.json': '{}' };
  await sw.dispatch('install');
  // o cache tem o main.js da v9; chega um pedido da v10
  sw.stores.get('ccdv-v9').set(ORIGIN + '/assets/js/main.js', new Response('js-antigo'));
  const res = await sw.request('/assets/js/main.js?v=v10');
  assert.equal(res.text, 'js-NOVO');
  assert.ok(sw.net.calls.some((c) => c.url === '/assets/js/main.js?v=v10'));
});

test('pedido versionado de outra versão sem rede: usa o cache como último recurso', async () => {
  const sw = boot();
  sw.net.files = { '/': 'h', '/index.html': 'h', '/assets/js/main.js': 'js-v9', '/data/exams.json': '{}' };
  await sw.dispatch('install');
  sw.net.online = false;
  const res = await sw.request('/assets/js/main.js?v=v10');
  assert.equal(res.text, 'js-v9');
});

test('dados sem ?v=: respondem do cache e atualizam em segundo plano', async () => {
  const sw = boot();
  sw.net.files = { '/': 'h', '/index.html': 'h', '/assets/js/main.js': 'js', '/data/exams.json': '{"v":1}' };
  await sw.dispatch('install');
  sw.net.files['/data/exams.json'] = '{"v":2}';
  sw.net.calls.length = 0;
  const first = await sw.request('/data/exams.json');
  assert.equal(first.text, '{"v":1}'); // resposta imediata, do cache
  assert.ok(sw.net.calls.some((c) => c.url === '/data/exams.json' && c.cache === 'no-cache')); // revalidou
  const second = await sw.request('/data/exams.json');
  assert.equal(second.text, '{"v":2}'); // e a próxima já vem atualizada
});

test('navegação: online usa a rede; offline cai no index.html do pré-cache', async () => {
  const sw = boot();
  sw.net.files = { '/': 'h', '/index.html': 'pagina-v9', '/assets/js/main.js': 'js', '/data/exams.json': '{}' };
  await sw.dispatch('install');
  sw.net.files['/index.html'] = 'pagina-nova';
  assert.equal((await sw.request('/index.html', { mode: 'navigate' })).text, 'pagina-nova');
  sw.net.online = false;
  assert.equal((await sw.request('/index.html?sw=1', { mode: 'navigate' })).text, 'pagina-v9');
});

test('PDF pedido em partes (Range) e outros casos que o SW não deve tocar', async () => {
  const sw = boot();
  assert.equal((await sw.request('/pdfs/a.pdf', { headers: { range: 'bytes=0-1023' } })).responded, false);
  assert.equal((await sw.request('/index.html', { method: 'POST' })).responded, false);
  assert.equal((await sw.request('/x.js', { origin: 'https://cdn.outro.test' })).responded, false);
});

test('activate: apaga caches de versões antigas e preserva os de outros apps', async () => {
  const sw = boot();
  sw.stores.set('ccdv-v1', new Map());
  sw.stores.set('ccdv-v9', new Map());
  sw.stores.set('outro-app', new Map());
  await sw.dispatch('activate');
  assert.deepEqual([...sw.stores.keys()].sort(), ['ccdv-v9', 'outro-app']);
});
