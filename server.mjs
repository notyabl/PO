import http from 'node:http';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Catalog } from './lib/catalog.mjs';
import { validateSearch } from './lib/sources.mjs';
import { Rooms } from './lib/rooms.mjs';

// Explicit allowlist keeps .git, .env and server sources outside the web root.
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/script.js', ['script.js', 'text/javascript; charset=utf-8']],
  ['/lib/search.mjs', ['lib/search.mjs', 'text/javascript; charset=utf-8']],
  ['/lib/sources.mjs', ['lib/sources.mjs', 'text/javascript; charset=utf-8']],
  ['/lib/client-api.mjs', ['lib/client-api.mjs', 'text/javascript; charset=utf-8']],
]);
export function createServer(catalog, rooms = new Rooms()) {
  let active = 0;
  return http.createServer(async (req, res) => {
    // A local Live Server preview can use the actual Dingo backend too.
    try {
      const origin = new URL(req.headers.origin);
      if (['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) && ['http:', 'https:'].includes(origin.protocol)) {
        res.setHeader('Access-Control-Allow-Origin', origin.origin);
        res.setHeader('Vary', 'Origin');
      }
    } catch { /* Same-origin requests have no Origin header. */ }
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(value));
    };
    if (req.method !== 'GET') return json(405, { error: 'Метод не поддерживается' });
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return json(400, { error: 'Неверный URL' }); }
    if (url.pathname === '/api/health') return json(200, { service: 'dingo', version: '1.2.0' });
    if (url.pathname === '/api/rooms') {
      const hotel = catalog.snapshot.hotels.find(h => h.id === url.searchParams.get('id'));
      if (!hotel) return json(404, { error: 'Объект не найден в каталоге' });
      if (active >= 8) return json(429, { error: 'Поиск занят. Повторите позже.' });
      active++;
      try { return json(200, await rooms.get(hotel)); }
      catch { return json(503, { error: 'Источник не вернул сведения о номерах. Откройте страницу объекта.' }); }
      finally { active--; }
    }
    if (url.pathname === '/api/hotels') {
      let query;
      try { query = validateSearch(Object.fromEntries(url.searchParams)); }
      catch (error) { return json(400, { error: error.message }); }
      if (active >= 8) return json(429, { error: 'Поиск занят. Повторите через несколько секунд.' });
      active++;
      try { return json(200, await catalog.search(query)); }
      catch (error) { console.error(error.message); return json(503, { error: 'Не удалось обновить каталог. Попробуйте позже.' }); }
      finally { active--; }
    }
    if (url.pathname === '/hotels.json') return json(200, catalog.select());
    const asset = assets.get(url.pathname);
    if (!asset) return json(404, { error: 'Не найдено' });
    try {
      const content = await fs.readFile(new URL(asset[0], import.meta.url));
      res.writeHead(200, { 'Content-Type': asset[1], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
      res.end(content);
    } catch { json(500, { error: 'Не удалось прочитать файл' }); }
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const catalog = await new Catalog().load();
  const port = Number(process.env.PORT || 3010), host = process.env.HOST || '127.0.0.1';
  createServer(catalog).listen(port, host, () => console.log('Dingo: http://' + host + ':' + port));
}
