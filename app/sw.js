// Xdatrys Maps app (2026-11-14): ONE offline helper for every map in the app (scope /app/).
// - Each saved map lives in its own store on the phone ("xd-app-map-<map>"), so it can be removed on its own.
// - Anything already saved is answered from the phone, so saved maps work without signal.
// - When there is signal, the small text files (spot texts, tours, the pages) are quietly refreshed in the background,
//   so corrections reach maps that were saved earlier. Map tiles and photos never change, so they are not refreshed.
const SHELL = "xd-app-shell";
const SHELL_FILES = ["/app/", "/app/library.json", "/app/manifest.webmanifest", "/app/icon-192.png", "/app/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(SHELL_FILES.map(u => fetch(u, { cache: "reload" }).then(r => r.ok && c.put(u, r)).catch(() => {}))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

const REFRESH = /\/app\/(library\.json|manifest\.webmanifest)?$|\/app\/m\/[^/]+\/(index\.html|spots\.json|v2\.json|tour\.json|tour_leisure\.json|map\.js|offline\.json)?$/;
const SHARED = /\/xdatrys_[a-z_]+\.js|unpkg\.com\/maplibre|\/fonts\/|basemaps-assets/;   // shared by every map: kept in the app's own store

async function findCached(req) {
  for (const name of await caches.keys()) {
    const c = await caches.open(name);
    const hit = (await c.match(req)) || (await c.match(req, { ignoreSearch: true }));
    if (hit) return { hit, c };
  }
  return null;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const ours = url.origin === location.origin;
  if (ours && !/^\/(app|tiles|r2tiles|fonts|xdatrys_)/.test(url.pathname)) return;     // other pages of the site: normal browsing
  e.respondWith((async () => {
    // 2026-11-26: the app's home page is fetched fresh first when there is signal (up to 4 s), so changes (e.g. the new menu)
    // show on the first opening; without signal the saved copy is used as before.
    if (ours && req.mode === "navigate" && /^\/app\/?$/.test(url.pathname)) {
      try {
        const r = await Promise.race([fetch(req, { cache: "no-store" }), new Promise((_, no) => setTimeout(() => no(new Error("slow")), 4000))]);
        if (r.ok) { const c = await caches.open(SHELL); c.put("/app/", r.clone()); return r; }
      } catch (err) {}
    }
    const found = await findCached(req);
    if (found) {
      if (ours && REFRESH.test(url.pathname)) {
        e.waitUntil(fetch(req, { cache: "no-store" }).then(r => r.ok && found.c.put(req, r)).catch(() => {}));
      }
      return found.hit;
    }
    try {
      const r = await fetch(req);
      if (r.ok && (SHARED.test(req.url) || (ours && SHELL_FILES.includes(url.pathname)))) {
        const c = await caches.open(SHELL); c.put(req, r.clone());
      }
      return r;
    } catch (err) {
      if (req.mode === "navigate") {                                             // offline and the page is not saved: show My maps
        const home = await caches.match("/app/");
        if (home) return home;
      }
      return Response.error();
    }
  })());
});
