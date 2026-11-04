const CACHE = "remont-e9cdb4a7";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim())));
// свои файлы: берём свежие с сайта, без интернета (или если сайт не ответил за 2 с) — сохранённую копию
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  const net = fetch(r.url, {cache: "no-cache"}).then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); } return res; });
  const saved = () => caches.match(r).then(m => m || caches.match("index.html"));
  e.respondWith(new Promise(done => { let over = false; const fin = v => { if (!over && v) { over = true; done(v); } };
    const t = setTimeout(() => saved().then(fin), 2000);
    net.then(res => { clearTimeout(t); fin(res); }).catch(() => { clearTimeout(t); saved().then(m => fin(m || Response.error())); }); }));
  e.waitUntil(net.catch(() => {}));
});
