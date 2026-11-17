import { sourceUrl, cityKey } from './sources.mjs';

export function bookingUrl(hotel, query) {
  const canonical = sourceUrl(hotel.bookingUrl, hotel.source);
  if (!canonical) return '';
  const url = new URL(canonical);
  if (hotel.source === 'ostrovok') {
    const date = iso => iso.split('-').reverse().join('.');
    if (query.checkin && query.checkout) url.searchParams.set('dates', date(query.checkin) + '-' + date(query.checkout));
    url.searchParams.set('guests', String(query.adults || 2));
  }
  if (hotel.source === 'hotels101') {
    const date = iso => iso.split('-').reverse().join('.');
    if (query.checkin && query.checkout) {
      url.searchParams.set('in', date(query.checkin));
      url.searchParams.set('out', date(query.checkout));
    }
    url.searchParams.set('adults', String(query.adults || 2));
  }
  // Sutochno's public URL is preserved: undocumented date/guest parameters are not guessed.
  return url.href;
}

export function filterHotels(hotels, state) {
  const list = hotels.filter(h => {
    if (state.city && !cityKey(h.city).includes(cityKey(state.city))) return false;
    const referencePrice = h.referencePrice ?? h.price;
    if (state.priceLimited && (!(referencePrice > 0) || referencePrice > state.maxPrice)) return false;
    if (state.stars?.size && !state.stars.has(h.stars)) return false;
    if (state.rating && h.rating < state.rating) return false;
    if (state.types?.size && !state.types.has(h.type)) return false;
    if (state.sources?.size && !state.sources.has(h.source)) return false;
    if (state.amenities?.size && ![...state.amenities].every(a => h.amenities?.includes(a))) return false;
    if (h.capacity && state.adults > h.capacity) return false;
    return true;
  });
  const comparePrice = direction => (a, b) => {
    const first = a.referencePrice ?? a.price, second = b.referencePrice ?? b.price;
    if (!(first > 0)) return second > 0 ? 1 : 0;
    if (!(second > 0)) return -1;
    return direction * (first - second);
  };
  if (state.sort === 'price-asc') list.sort(comparePrice(1));
  else if (state.sort === 'price-desc') list.sort(comparePrice(-1));
  else if (state.sort === 'rating') list.sort((a,b) => b.rating - a.rating);
  else list.sort((a,b) => b.reviews - a.reviews || b.rating - a.rating);
  return list;
}
