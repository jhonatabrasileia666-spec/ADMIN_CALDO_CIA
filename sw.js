/* Service Worker do Painel Admin (PWA + notificacao push)
   - Recebe o aviso de pedido novo mesmo com o app fechado / celular bloqueado
   - Nao guarda cache do HTML (para voce sempre abrir a versao mais nova)
*/

const CACHE = "admin-shell-v2";
const ARQUIVOS = ["./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

// Rede primeiro; usa cache so para os icones/manifest quando estiver offline.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then((r) => r || Response.error())),
  );
});

// ---------- PUSH: chega mesmo com o celular bloqueado ----------
self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch (e) {
    dados = { corpo: event.data ? event.data.text() : "" };
  }

  const titulo = dados.titulo || "🔔 Novo pedido!";
  const opcoes = {
    body: dados.corpo || "Chegou um pedido novo no painel.",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: dados.tag || "novo-pedido",
    renotify: true,
    requireInteraction: true,
    vibrate: [400, 150, 400, 150, 600],
    data: { url: dados.url || "./admin.html" },
    actions: [{ action: "abrir", title: "Abrir painel" }],
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(titulo, opcoes);
      const clientes = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      clientes.forEach((c) => c.postMessage({ tipo: "novo-pedido", dados }));
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || "./admin.html";
  event.waitUntil(
    (async () => {
      const clientes = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of clientes) {
        if ("focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(destino);
    })(),
  );
});

// A pagina pede pro SW mostrar a notificacao quando o app esta aberto/minimizado
self.addEventListener("message", (event) => {
  const m = event.data || {};
  if (m.tipo === "mostrar-notificacao") {
    self.registration.showNotification(m.titulo || "🔔 Novo pedido!", {
      body: m.corpo || "",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: m.tag || "novo-pedido",
      renotify: true,
      requireInteraction: true,
      vibrate: [400, 150, 400, 150, 600],
      data: { url: "./admin.html" },
    });
  }
});
