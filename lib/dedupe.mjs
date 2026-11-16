export function dedupe(hotels) {
  const map = new Map();

  for (const hotel of hotels) {
    const key = makeKey(hotel.name, hotel.city);
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, { ...hotel, sources: [hotel.source] });
      continue;
    }

    const existing = map.get(key);
    existing.sources.push(hotel.source);

    // Оставляем более низкую цену; если цена неизвестна — не трогаем
    if (hotel.price > 0 && (existing.price === 0 || hotel.price < existing.price)) {
      existing.price = hotel.price;
      existing.bookingUrl = hotel.bookingUrl;
      existing.source = hotel.source;
    }

    // Дополняем недостающие поля
    if (!existing.image && hotel.image) existing.image = hotel.image;
    if (!existing.rating && hotel.rating) existing.rating = hotel.rating;
    if (!existing.stars && hotel.stars) existing.stars = hotel.stars;
  }

  return [...map.values()].map((hotel, index) => ({
    ...hotel,
    id: index + 1,
  }));
}

function makeKey(name, city) {
  const n = String(name || '')
    .toLowerCase()
    .replace(/[«»"'()\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const c = String(city || '').toLowerCase().trim();
  if (!n) return null;
  return `${n}|${c}`;
}