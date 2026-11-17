import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parse101Hotels, parse101Rooms } from '../adapters/hotels101.mjs';
import { createApiClient, readJsonResponse, API_UNAVAILABLE } from '../lib/client-api.mjs';
import { CITIES, validateSearch } from '../lib/sources.mjs';
import { bookingUrl, filterHotels } from '../lib/search.mjs';

test('real 101Hotels card preserves matching identity, photo and source attributes', async () => {
  const [hotel] = parse101Hotels(await fs.readFile(new URL('fixtures/101hotels-catalog.html', import.meta.url), 'utf8'), { city: 'Москва' });
  assert.equal(hotel.source, 'hotels101');
  assert.equal(hotel.sourceId, '480936');
  assert.equal(hotel.name, 'Отель Pentahotel Moscow, Arbat');
  assert.equal(hotel.stars, 4);
  assert.equal(hotel.rating, 9.4);
  assert.equal(hotel.reviews, 3398);
  assert.equal(hotel.referencePrice, 7200);
  assert.equal(hotel.price, null, 'catalog amount is not a verified tariff');
  assert.deepEqual(hotel.amenities, ['wifi'], 'parking is explicitly false in the source');
  assert.ok(hotel.image.includes('/480936/342681_preview.jpg'));
  assert.equal(filterHotels([hotel], { sources: new Set(['ostrovok']) }).length, 0);
  assert.equal(filterHotels([hotel], { sources: new Set(['hotels101']) }).length, 1);
  const url = new URL(bookingUrl(hotel, { checkin: '2027-01-10', checkout: '2027-01-13', adults: 3 }));
  assert.equal(url.searchParams.get('in'), '10.01.2027');
  assert.equal(url.searchParams.get('out'), '13.01.2027');
  assert.equal(url.searchParams.get('adults'), '3');
});
test('real 101Hotels room excerpt parses categories, area and capacity without invented availability', async () => {
  const hotel = { source: 'hotels101', bookingUrl: 'https://101hotels.com/main/cities/moskva/pentahotel_moscow_arbat.html' };
  const html = await fs.readFile(new URL('fixtures/101hotels-rooms.html', import.meta.url), 'utf8');
  const rooms = parse101Rooms(html, hotel);
  assert.equal(rooms.length, 2);
  assert.ok(rooms[0].name.includes('Стандартный номер'));
  assert.equal(rooms[0].area, 20);
  assert.equal(rooms[0].capacity, 2);
  assert.equal(rooms[0].price, null);
  assert.throws(() => parse101Rooms(html, { bookingUrl: 'https://101hotels.com/main/cities/moskva/other.html' }));
});
test('HTML error pages and malformed JSON never expose JSON.parse errors', async () => {
  const responses = [new Response('<html>Not found</html>', { status: 404, headers: { 'content-type': 'text/html' } }), new Response('{broken', { headers: { 'content-type': 'application/json' } })];
  for (const response of responses) await assert.rejects(readJsonResponse(response, 'Номера доступны у источника.'), error => error.message === 'Номера доступны у источника.');
});
test('a local static preview discovers Dingo on 3010 and uses its rooms API', async () => {
  const calls = [];
  const api = createApiClient({ location: new URL('http://127.0.0.1:5500/Dingo/index.html'), fetchImpl: async url => {
    calls.push(url);
    if (url.startsWith('http://127.0.0.1:5500')) return new Response('<!doctype html>', { status: 404, headers: { 'content-type': 'text/html' } });
    if (url.endsWith('/health')) return Response.json({ service: 'dingo' });
    return Response.json({ rooms: [{ name: 'Стандарт' }] });
  }});
  const result = await api.request('rooms', { id: 'example' });
  assert.equal(result.rooms[0].name, 'Стандарт');
  assert.ok(calls.includes('http://127.0.0.1:3010/api/rooms?id=example'));
});
test('offline room service returns a human-readable error', async () => {
  const api = createApiClient({ location: new URL('http://127.0.0.1:5500'), fetchImpl: async () => { throw new Error('network failure'); } });
  await assert.rejects(api.request('rooms'), error => error.message === API_UNAVAILABLE);
});
test('requested new cities are supported by validation and both available sources', () => {
  for (const city of ['Краснодар', 'Волгоград', 'Ростов-на-Дону']) {
    const config = CITIES.find(item => item.name === city);
    assert.ok(config?.ostrovok && config?.hotels101);
    assert.equal(validateSearch({ city, checkin: '2027-01-10', checkout: '2027-01-13', adults: 2 }).city, city);
  }
});
