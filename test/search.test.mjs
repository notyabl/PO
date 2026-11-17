import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHotel, parsePrice, mapAmenities } from '../lib/normalize.mjs';
import { dedupe } from '../lib/dedupe.mjs';
import { filterHotels, bookingUrl } from '../lib/search.mjs';
import { sourceUrl, validateSearch } from '../lib/sources.mjs';

const raw = { name: 'Стандарт', city: 'Москва', bookingUrl: 'https://sutochno.ru/10001', rating: 4.5, price: null };
const hotel = overrides => normalizeHotel({ ...raw, ...overrides }, 'sutochno');
const state = overrides => ({ stars: new Set(), types: new Set(), amenities: new Set(), maxPrice: 10000, ...overrides });

test('unknown price stays unknown; low ratings are not silently doubled', () => {
  assert.equal(hotel({}).price, null);
  assert.equal(hotel({}).rating, 4.5);
  assert.equal(hotel({ ratingScale: 5 }).rating, 9);
  assert.equal(hotel({ price: 100, currency: 'USD' }).price, null);
});
test('price parser does not combine old price, discount, nights and new price', () => {
  assert.equal(parsePrice('9\u00a0498\u202f₽ 12 000 ₽ скидка 20% за 3 ночи'), 9498);
  assert.equal(parsePrice('от 3 000,50 руб.'), 3000.5);
  assert.equal(parsePrice('уточнить цену'), 0);
});
test('different rooms with identical names and cross-source offers remain separate', () => {
  const first = hotel({});
  const second = hotel({ bookingUrl: 'https://sutochno.ru/10002' });
  const third = normalizeHotel({ ...raw, bookingUrl: 'https://ostrovok.ru/hotel/russia/moscow/mid1/test/' }, 'ostrovok');
  assert.equal(dedupe([first, second, third, first]).length, 3);
  assert.equal(dedupe([second, first])[1].id, first.id);
});
test('joint filters use known source attributes and known room capacity', () => {
  const one = hotel({ price: 5000, stars: 4, rating: 9.2, amenities: ['wifi', 'parking'], capacity: 2 });
  const two = hotel({ price: 2000, stars: 3, rating: 8, amenities: ['wifi'], bookingUrl: 'https://sutochno.ru/10002' });
  assert.deepEqual(filterHotels([one, two], state({ stars: new Set([4]), rating: 9, amenities: new Set(['wifi', 'parking']), priceLimited: true, maxPrice: 6000, adults: 2 })), [one]);
  assert.equal(filterHotels([one], state({ adults: 3 })).length, 0);
  assert.equal(filterHotels([one], state({ types: new Set(['apart']) })).length, 0);
  assert.equal(filterHotels([one], state({ city: 'Казань' })).length, 0);
  assert.deepEqual(mapAmenities(['has_meal', 'has_internet', 'has_parking']), ['wifi', 'parking']);
});
test('unknown prices are excluded with a budget and sorted last in both directions', () => {
  const unknown = hotel({}), low = hotel({ price: 1000 }), high = hotel({ price: 8000 });
  assert.deepEqual(filterHotels([unknown, low, high], state({ priceLimited: true, maxPrice: 5000 })), [low]);
  assert.deepEqual(filterHotels([unknown, high, low], state({ sort: 'price-asc' })), [low, high, unknown]);
  assert.deepEqual(filterHotels([unknown, low, high], state({ sort: 'price-desc' })), [high, low, unknown]);
});
test('booking URLs only allow actual source domains and public property routes', () => {
  assert.equal(sourceUrl('https://ostrovok.ru.evil.example/hotel/russia/mid1/a/', 'ostrovok'), '');
  assert.equal(sourceUrl('javascript:alert(1)', 'sutochno'), '');
  assert.equal(sourceUrl('https://sutochno.ru/hotels', 'sutochno'), '');
  assert.equal(sourceUrl('https://sutochno.ru/front/searchapp/detail/10001', 'sutochno'), 'https://sutochno.ru/10001');
  const url = new URL(bookingUrl({ source: 'ostrovok', bookingUrl: 'https://ostrovok.ru/hotel/russia/moscow/mid1/test/' }, { checkin: '2027-01-03', checkout: '2027-01-04', adults: 3 }));
  assert.equal(url.searchParams.get('dates'), '03.01.2027-04.01.2027');
  assert.equal(url.searchParams.get('guests'), '3');
  assert.equal(bookingUrl(hotel({}), { adults: 3 }), raw.bookingUrl);
});
test('invalid dates, unsupported cities and invalid guests are rejected', () => {
  const valid = { city: 'москва', checkin: '2027-01-01', checkout: '2027-01-03', adults: 2 };
  assert.equal(validateSearch(valid).city, 'Москва');
  for (const invalid of [{ checkin: '2027-02-30' }, { checkout: valid.checkin }, { adults: 0 }, { adults: '2x' }, { city: 'unknown' }, { checkin: '2020-01-01' }]) {
    assert.throws(() => validateSearch({ ...valid, ...invalid }));
  }
});
