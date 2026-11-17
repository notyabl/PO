import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parseOstrovok } from '../adapters/ostrovok.mjs';
import { parseSutochno } from '../adapters/sutochno.mjs';
import { parseRooms, Rooms } from '../lib/rooms.mjs';
import { fetchHtml } from '../lib/http.mjs';
import { filterHotels } from '../lib/search.mjs';

const fixture = name => fs.readFile(new URL('fixtures/' + name, import.meta.url), 'utf8');
test('real apartment capacity affects guest selection without claiming availability', async () => {
  const [hotel] = parseOstrovok(await fixture('ostrovok-apartment.html'), { city: 'Калининград' });
  assert.equal(hotel.type, 'apart');
  assert.equal(hotel.capacity, 4);
  assert.equal(filterHotels([hotel], { adults: 4 }).length, 1);
  assert.equal(filterHotels([hotel], { adults: 5 }).length, 0);
});
test('Ostrovok real public HTML excerpt maps matching photo, identity and reference price', async () => {
  const [hotel] = parseOstrovok(await fixture('ostrovok-catalog.html'), { city: 'Москва' });
  assert.equal(hotel.sourceId, '7858838');
  assert.equal(hotel.name, 'Гостиница Radisson Blu Белорусская, Москва');
  assert.equal(hotel.referencePrice, 9498);
  assert.equal(hotel.price, null);
  assert.equal(hotel.priceKind, 'unknown');
  assert.equal(hotel.stars, 4);
  assert.equal(hotel.rating, 8.8);
  assert.ok(hotel.image.includes('605524622d640133c9fd003bf25395f5253db91b'));
  assert.ok(hotel.bookingUrl.endsWith('/mid7858838/redisson_belorusskaia_moskva/'));
  assert.ok(hotel.amenities.includes('wifi'));
  assert.ok(!hotel.amenities.includes('breakfast'));
});
test('Ostrovok real room groups retain names and sizes, without invented room prices', async () => {
  const [hotel] = parseOstrovok(await fixture('ostrovok-catalog.html'), { city: 'Москва' });
  const html = await fixture('ostrovok-rooms.html');
  const rooms = parseRooms(html, hotel);
  assert.equal(rooms.length, 2);
  assert.equal(rooms[0].name, 'Номер Стандартный');
  assert.equal(rooms[0].area, 30);
  assert.equal(rooms[0].price, null);
  assert.throws(() => parseRooms(html, { ...hotel, sourceId: '123' }));
  let calls = 0;
  const service = new Rooms({ fetchImpl: async () => { calls++; return html; } });
  await Promise.all([service.get(hotel), service.get(hotel)]);
  assert.equal(calls, 1);
});
test('Sutochno synthetic DOM contract: distinct rooms, card-scoped images, daily price only', () => {
  // Synthetic markup tests the extraction contract; this is not a saved live Sutochno response.
  const html = [101,102].map(id => `<article class="card"><img src="https://cdn.sutochno.ru/photos/${id}.jpg">
    <div class="card-content"><a class="card-content__hotel-name" href="/hotels/900">Гостиница</a>
    <a href="/front/searchapp/detail/${id}"><span class="card-content__object-type">Стандарт</span></a>
    <span class="card-content__rating">4,5</span><span>2 гостя, 5 отзывов</span>
    <div>${id === 101 ? '3 500 ₽ за сутки' : '12 000 ₽ за 3 суток'}</div>
    <span title="беспроводной интернет Wi-Fi"></span></div></article>`).join('');
  const hotels = parseSutochno(html, { city: 'Москва' });
  assert.equal(hotels.length, 2);
  assert.equal(hotels[0].bookingUrl, 'https://www.sutochno.ru/101');
  assert.equal(hotels[0].roomName, 'Стандарт');
  assert.equal(hotels[0].type, 'hotel');
  assert.equal(hotels[0].image, 'https://cdn.sutochno.ru/photos/101.jpg');
  assert.equal(hotels[1].image, 'https://cdn.sutochno.ru/photos/102.jpg');
  assert.equal(hotels[0].referencePrice, 3500);
  assert.equal(hotels[0].price, null);
  assert.equal(hotels[1].price, null);
  assert.equal(hotels[0].rating, 4.5);
  assert.equal(hotels[0].capacity, 2);
});
test('missing image is never replaced by another card or an icon', () => {
  const html = '<div class="card-content"><a href="/123"><span class="card-content__object-type">Комната</span></a><img src="https://sutochno.ru/flash.svg"></div><img src="https://cdn.sutochno.ru/other.jpg">';
  const [hotel] = parseSutochno(html, { city: 'Москва' });
  assert.equal(hotel.image, '');
  assert.equal(hotel.price, null);
});
test('JSON-LD fallback respects explicit rating scales and ignores unspecified price units', () => {
  const html = '<script type="application/ld+json">' + JSON.stringify({ '@graph': [{ '@type':'HotelRoom', name:'Стандарт', url:'https://sutochno.ru/123', aggregateRating:{ratingValue:4.5,bestRating:5}, offers:{price:9999} }] }) + '</script>';
  const [hotel] = parseSutochno(html, { city: 'Москва' });
  assert.equal(hotel.rating, 9);
  assert.equal(hotel.price, null);
});
test('changed markup produces no fake records; HTTP blocks are explicit errors', async () => {
  assert.deepEqual(parseOstrovok('<h1>CAPTCHA</h1>', { city: 'Москва' }), []);
  assert.deepEqual(parseSutochno('<h1>New layout</h1>', { city: 'Москва' }), []);
  await assert.rejects(fetchHtml('https://sutochno.ru', { fetchImpl: async () => new Response('', { status: 403 }) }), /403/);
});
