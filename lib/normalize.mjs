import { sourceUrl, safeImage } from './sources.mjs';

export function numberValue(value) {
  const number = Number(String(value ?? '').replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}
export function parsePrice(text) {
  const match = String(text || '').match(/(\d[\d\s\u00a0\u202f]*(?:[.,]\d{1,2})?)\s*(?:₽|руб\.?|RUB)/i);
  return match ? numberValue(match[1]) : 0;
}
export function mapType(value) {
  const type = String(value || '').toLowerCase();
  if (/хостел|hostel/.test(type)) return 'hostel';
  if (/санатор|sanatorium/.test(type)) return 'sanatorium';
  if (/resort/.test(type)) return 'resort';
  if (/living_quarters/.test(type)) return 'living';
  if (/апарт|квартир|apart/.test(type)) return 'apart';
  if (/вилл|коттедж|villa|cottage/.test(type)) return 'villa';
  if (/гостевой|guest/.test(type)) return 'guest';
  return 'hotel';
}
export function mapAmenities(values = []) {
  const rules = {
    wifi: /^(?:has_internet|wifi)$|wi-fi|интернет/i,
    parking: /^(?:has_parking|parking)$|парков/i,
    pool: /^(?:has_pool|pool)$|бассейн/i,
    spa: /^(?:has_spa|spa)$|спа|spa service/i,
    gym: /^(?:has_fitness|gym)$|фитнес|тренажер/i,
    breakfast: /^(?:has_breakfast|breakfast)$|завтрак\s+(?:включ[её]н|входит)/i,
  };
  return Object.entries(rules).filter(([, rule]) => values.some(value => rule.test(value))).map(([key]) => key);
}
export function normalizeHotel(raw, source) {
  const bookingUrl = sourceUrl(raw.bookingUrl, source);
  if (!raw.name?.trim() || !raw.city?.trim() || !bookingUrl) return null;
  const rating = numberValue(raw.rating), scale = numberValue(raw.ratingScale) || 10;
  const amount = numberValue(raw.price);
  const price = amount > 0 && (!raw.currency || raw.currency === 'RUB') ? Math.round(amount) : null;
  return {
    id: source + ':' + new URL(bookingUrl).pathname,
    source, sources: [source], sourceId: String(raw.sourceId || ''),
    name: raw.name.trim(), city: raw.city.trim(),
    district: String(raw.district || '').trim(), address: String(raw.address || '').trim(),
    stars: Math.min(5, Math.max(0, Math.trunc(numberValue(raw.stars)))),
    rating: Math.min(10, Math.max(0, Math.round(rating / scale * 100) / 10)),
    reviews: Math.max(0, Math.trunc(numberValue(raw.reviews))),
    type: mapType(raw.type), amenities: mapAmenities(raw.amenities),
    image: safeImage(raw.image), bookingUrl,
    roomName: String(raw.roomName || '').trim(),
    capacity: numberValue(raw.capacity) > 0 ? Math.trunc(numberValue(raw.capacity)) : null,
    price: null, referencePrice: price, currency: 'RUB', priceKind: 'unknown',
    pricePeriod: null, referencePricePeriod: price ? 'night' : null,
    fetchedAt: raw.fetchedAt || new Date().toISOString(),
    sourcePage: String(raw.sourcePage || bookingUrl),
  };
}
