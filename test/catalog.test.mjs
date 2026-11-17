import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Catalog } from '../lib/catalog.mjs';
import { normalizeHotel } from '../lib/normalize.mjs';
import { createServer } from '../server.mjs';

const hotel = normalizeHotel({ name: 'Отель', city: 'Москва', bookingUrl: 'https://sutochno.ru/12345', price: 5000 }, 'sutochno');
test('failed source retains last successful data; successful source replaces only its own city', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dingo-test-'));
  assert.ok(path.resolve(dir).startsWith(path.join(path.resolve(os.tmpdir()), 'dingo-test-')));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let failed = false, calls = 0;
  const catalog = new Catalog({ file: path.join(dir, 'hotels.json'), adapters: {
    sutochno: async () => { calls++; if (failed) throw new Error('timeout'); return [hotel]; },
    ostrovok: async () => { throw new Error('HTTP 403'); },
  }});
  await catalog.refresh('Москва');
  failed = true;
  await catalog.refresh('Москва');
  assert.equal(catalog.snapshot.hotels.length, 1);
  assert.equal(catalog.snapshot.hotels[0].referencePrice, 5000);
  assert.equal(catalog.snapshot.hotels[0].price, null);
  assert.equal(catalog.snapshot.statuses.find(s => s.source === 'sutochno').status, 'unavailable');
  assert.ok(catalog.snapshot.statuses.find(s => s.source === 'sutochno').lastSuccessAt);
  await catalog.search({ city: 'Москва' });
  assert.equal(calls, 2, 'failure status has backoff too');
  const reloaded = await new Catalog({ file: catalog.file }).load();
  assert.deepEqual(reloaded.snapshot, catalog.snapshot);
  await assert.rejects(catalog.import('Москва', 'sutochno', []));
  assert.equal(catalog.snapshot.hotels.length, 1);
});
test('HTML import does not claim a fetch time that is unknown', async () => {
  const catalog = new Catalog({ adapters: { sutochno: async () => { throw new Error('timeout'); } } });
  catalog.save = async () => {};
  await catalog.import('Москва', 'sutochno', [hotel]);
  assert.equal(catalog.snapshot.hotels[0].fetchedAt, null);
  assert.ok(catalog.snapshot.hotels[0].importedAt);
  await catalog.refresh('Москва');
  assert.equal(catalog.snapshot.hotels[0].fetchedAt, null);
  assert.equal(catalog.snapshot.statuses[0].lastSuccessAt, null);
});
test('concurrent searches share one upstream fetch and empty extraction preserves cache', async () => {
  let calls = 0;
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const catalog = new Catalog({ adapters: { sutochno: async () => { calls++; await barrier; return []; } } });
  catalog.save = async () => {};
  catalog.snapshot.hotels = [hotel];
  const a = catalog.refresh('Москва'), b = catalog.refresh('Москва');
  release();
  await Promise.all([a,b]);
  assert.equal(calls, 1);
  assert.equal(catalog.snapshot.hotels.length, 1);
  assert.equal(catalog.snapshot.statuses[0].status, 'unavailable');
});
test('HTTP search, invalid requests, room identity, and private file isolation', async t => {
  const catalog = new Catalog();
  catalog.snapshot.hotels = [hotel];
  const server = createServer(catalog, { get: async () => ({ rooms: [{ name: 'Стандарт' }] }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  for (const asset of ['/', '/script.js', '/style.css', '/lib/search.mjs', '/lib/sources.mjs']) {
    assert.equal((await fetch(base + asset)).status, 200);
  }
  for (const privatePath of ['/.env', '/.git/config', '/server.mjs', '/package.json', '/lib/catalog.mjs']) {
    assert.equal((await fetch(base + privatePath)).status, 404);
  }
  assert.equal((await fetch(base + '/api/hotels?adults=0')).status, 400);
  const response = await fetch(base + '/api/hotels?checkin=2027-01-01&checkout=2027-01-02&adults=2');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.priceMode, 'source-only');
  assert.equal(data.availabilityChecked, false);
  assert.equal(data.hotels[0].bookingUrl, hotel.bookingUrl);
  assert.equal((await fetch(base + '/api/rooms?id=unknown')).status, 404);
  assert.equal((await fetch(base + '/api/rooms?id=' + encodeURIComponent(hotel.id))).status, 200);
});
