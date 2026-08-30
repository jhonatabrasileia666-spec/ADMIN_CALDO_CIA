// =====================================================================
//  Service Worker: Caldo & Cia - Painel Admin
//  Salve como sw.js na MESMA pasta do index.html e do manifest.json.
//  (é o arquivo que faltava para o código que já existe no index.html
//   funcionar de verdade: navigator.serviceWorker.register('./sw.js'))
//
//  Cuida de 3 coisas:
//    1) Deixar o app instalável (PWA) com o "esqueleto" em cache
//    2) Mostrar a notificação quando chega um push (app fechado/bloqueado)
//    3) Avisar a aba do painel, se estiver aberta, pra recarregar na hora
// =====================================================================

const CACHE_NAME = 'caldo-admin-v1'; // suba esse número quando quiser forçar a limpeza do cache antigo
const ARQUIVOS_APP_SHELL = [
  './',
  './index.html',
  './icon-192.png',
  './icon-512.png',
];

// --- instalação: guarda o "esqueleto" do app no cache ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // adiciona um por um: se faltar algum arquivo no servidor, os outros
      // ainda assim entram no cache em vez de travar a instalação inteira
      await Promise.all(
        ARQUIVOS_APP_SHELL.map((url) =>
          cache.add(url).catch((e) => console.warn('[sw] não guardou em cache:', url, e))
        )
      );
      return self.skipWaiting(); // ativa a nova versão sem esperar fechar todas as abas
    })
  );
});

// --- ativação: limpa caches de versões antigas do app ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(
        nomes.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim()) // passa a controlar as abas já abertas
  );
});

// --- fetch: só mexe em GET do próprio site; Supabase/CDN passam direto pela rede ---
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // navegação (abrir/recarregar a página): tenta a rede primeiro, cai pro cache se estiver offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // outros arquivos do próprio site (ícones etc.): cache primeiro, rede como reforço
  event.respondWith(
    caches.match(req).then((resposta) => resposta || fetch(req))
  );
});

// --- push: chega da Edge Function "notificar-pedido" com {titulo, corpo, tag, url} ---
self.addEventListener('push', (event) => {
  let dados = {};
  try { dados = event.data ? event.data.json() : {}; } catch (e) { /* payload vazio ou inválido */ }

  const titulo = dados.titulo || '🔔 Novo pedido';
  const opcoes = {
    body: dados.corpo || '',
    tag: dados.tag || 'pedido',
    renotify: true,
    requireInteraction: true,
    vibrate: [400, 150, 400, 150, 600],
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { url: dados.url || './index.html' },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(titulo, opcoes),
      avisarAbasAbertas(),
    ])
  );
});

// avisa qualquer aba do painel já aberta pra recarregar a lista de pedidos na hora
// (o index.html já escuta isso: navigator.serviceWorker.addEventListener('message', ...))
async function avisarAbasAbertas() {
  const clientesAbertos = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clientesAbertos.forEach((cliente) => cliente.postMessage({ tipo: 'novo-pedido' }));
}

// --- clique na notificação: foca a aba do painel (ou abre uma nova) ---
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './index.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const cliente of lista) {
        if ('focus' in cliente) return cliente.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
