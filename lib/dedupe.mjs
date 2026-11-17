import { sourceUrl } from './sources.mjs';
// Titles are not identities: keep different rooms and different sources separate.
export function dedupe(hotels) {
  const entries = new Map();
  for (const hotel of hotels) {
    if (!hotel) continue;
    const url = sourceUrl(hotel.bookingUrl, hotel.source);
    if (!url) continue;
    const key = hotel.source + ':' + new URL(url).pathname;
    const previous = entries.get(key);
    if (!previous || String(hotel.fetchedAt || '') >= String(previous.fetchedAt || '')) {
      entries.set(key, { ...hotel, id: key, bookingUrl: url, sources: [hotel.source] });
    }
  }
  return [...entries.values()];
}
