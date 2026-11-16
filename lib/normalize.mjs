// Приводит «сырые» данные от любого адаптера к единому формату Dingo

export function normalizeHotel(raw, source) {
  return {
    id: 0,                                  // выставим после дедупликации
    source,                                 // 'ostrovok' | 'sutochno'
    name: String(raw.name || '').trim(),
    city: String(raw.city || '').trim(),
    district: String(raw.district || '').trim(),
    stars: Math.min(5, Math.max(0, Number(raw.stars) || 0)),
    rating: clampRating(raw.rating),        // всегда 0–10
    reviews: Math.max(0, Number(raw.reviews) || 0),
    price: Math.max(0, Math.round(Number(raw.price) || 0)), // всегда рубли
    type: mapType(raw.type),                 // hotel | apart | villa | guest
    amenities: Array.isArray(raw.amenities) ? raw.amenities.slice(0, 6) : [],
    image: String(raw.image || ''),
    bookingUrl: String(raw.bookingUrl || ''),
    website: String(raw.website || ''),
  };
}

function clampRating(value) {
  let r = parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(r) || r < 0) return 0;
  // Если источник отдал 5-балльную шкалу — растягиваем до 10
  if (r > 0 && r <= 5) r = r * 2;
  return Math.min(10, Math.round(r * 10) / 10);
}

function mapType(rawType) {
  const t = String(rawType || '').toLowerCase();
  if (t.includes('апарт') || t.includes('apart')) return 'apart';
  if (t.includes('вилл') || t.includes('villa')) return 'villa';
  if (t.includes('гост') || t.includes('guest')) return 'guest';
  return 'hotel';
}