// Service Worker do Simulador CCDV-F (PWA offline).
//
// - O build troca CACHE_VERSION pelo hash do commit e preenche PRECACHE com todos os arquivos do site
//   (menos PDFs, que são guardados quando abertos). Cada deploy tem o próprio cache.
// - Ao ativar, os caches de versões anteriores são apagados.
// - Pedidos versionados (?v=hash) só são servidos do cache se a versão for a deste service worker.
//   Assim um index.html novo nunca recebe JS antigo.

const CACHE_VERSION = 'dev';
const CACHE_NAME = `ccdv-${CACHE_VERSION}`;

// BUILD:PRECACHE_START
const PRECACHE = [];
// BUILD:PRECACHE_END

// Caminhos do pré-cache são relativos ao próprio sw.js (no GitHub Pages o site vive em /nome-do-repo/).
const abs = (path) => new URL(path, self.location.href).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // cache: 'reload' ignora o cache HTTP: o pré-cache guarda exatamente os arquivos deste deploy.
      await Promise.all(
        PRECACHE.map(async (url) => {
          const response = await fetch(new Request(abs(url), { cache: 'reload' }));
          if (!response.ok) throw new Error(`${url}: ${response.status}`);
          await cache.put(abs(url), response);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('ccdv-') && name !== CACHE_NAME) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.headers.has('range')) return; // PDFs pedidos em partes: direto da rede (resposta 206 não é cacheável)
  event.respondWith(request.mode === 'navigate' ? navigate(request) : asset(request, event));
});

// Páginas: rede primeiro (sempre o HTML mais novo); sem rede, o index.html do pré-cache.
async function navigate(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    const page = await cache.match(abs('./index.html'), { ignoreSearch: true });
    if (page) return page;
    throw error;
  }
}

// Arquivos: cache primeiro. Sem ?v= (dados e PDFs) o cache é atualizado em segundo plano.
async function asset(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const version = new URL(request.url).searchParams.get('v');
  const versioned = version !== null;

  if (!versioned || version === CACHE_VERSION) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) {
      if (!versioned) event.waitUntil(refresh(cache, request));
      return hit;
    }
  }
  try {
    const response = await fetch(request);
    if (response.ok) event.waitUntil(cache.put(request, response.clone()));
    return response;
  } catch (error) {
    const fallback = await cache.match(request, { ignoreSearch: true });
    if (fallback) return fallback;
    throw error;
  }
}

async function refresh(cache, request) {
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) await cache.put(request, response);
  } catch {
    /* offline: mantém o que já está no cache */
  }
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
