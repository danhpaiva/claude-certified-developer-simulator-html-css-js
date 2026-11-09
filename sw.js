// Service Worker para o Simulador CCDV-F
// Estratégia: stale-while-revalidate para assets e dados
// A versão do cache é atualizada no deploy (substituir CACHE_VERSION com hash do commit)

const CACHE_VERSION = 'v1';
const CACHE_NAME = `ccdv-${CACHE_VERSION}`;

// Assets estáticos essenciais (pré-cache no install)
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/style/main.css',
  './assets/js/main.js',
  './assets/js/dom.js',
  './assets/js/i18n.js',
  './assets/js/store.js',
  './assets/js/home.js',
  './assets/js/exam.js',
  './assets/js/result.js',
  './assets/js/question.js',
  './assets/js/scoring.js',
  './assets/js/rich.js',
  './assets/js/train.js',
  './assets/js/stats.js',
  './data/exams.json',
];

// Padrões de URLs para cachear dinamicamente
const DATA_PATTERN = /\/data\/exams\/.+\.json$/;
const ASSET_PATTERN = /\/(assets|data)\//;

// Install: pré-cacheia os assets essenciais
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      console.log('[SW] Installed, skipping waiting');
      return self.skipWaiting();
    })
  );
});

// Activate: limpa caches antigos
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...', CACHE_NAME);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName.startsWith('ccdv-') && cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Activated, claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch: stale-while-revalidate para assets e dados
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignora requisições de outros domínios (exceto same-origin)
  if (url.origin !== location.origin) {
    return;
  }
  
  // Ignora requisições que não sejam GET
  if (request.method !== 'GET') {
    return;
  }
  
  // Estratégia: stale-while-revalidate
  // Retorna do cache imediatamente, mas busca uma versão atualizada em background
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      
      const fetchPromise = fetch(request).then((response) => {
        // Só cacheia respostas OK
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      }).catch((err) => {
        console.log('[SW] Fetch failed, using cache:', url.pathname);
        // Se a rede falhar e não houver cache, retorna erro
        throw err;
      });
      
      // Retorna o cache imediatamente, ou a rede se não houver cache
      return cached || fetchPromise;
    })
  );
});

// Message: comandos do cliente (ex: pular cache, forçar atualização)
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Skip waiting requested');
    self.skipWaiting();
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    console.log('[SW] Clear cache requested');
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName.startsWith('ccdv-')) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    );
  }
});
