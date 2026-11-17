import { load } from 'cheerio';
import { normalizeHotel, parsePrice } from '../lib/normalize.mjs';
import { catalogUrl } from '../lib/sources.mjs';
import { fetchHtml } from '../lib/http.mjs';
import { structuredItems } from '../lib/structured.mjs';

export function parseOstrovok(html, { city, sourcePage = catalogUrl(city, 'ostrovok'), fetchedAt } = {}) {
  const $ = load(html);
  let data;
  try { data = JSON.parse($('#__NEXT_DATA__').text()).props.pageProps; } catch {}
  const schema = structuredItems($);
  const schemaByUrl = new Map(schema.map(item => [item.url, item]));
  if (Array.isArray(data?.serpData?.hotels)) {
    return data.serpData.hotels.map(hotel => {
      const bookingUrl = 'https://ostrovok.ru/hotel/' + hotel.regionCatalogSlug + '/mid' + hotel.masterId + '/' + hotel.id + '/';
      const item = schemaByUrl.get(bookingUrl);
      return normalizeHotel({
        sourceId: hotel.masterId, name: hotel.name, city,
        address: hotel.location?.address,
        stars: hotel.stars, rating: hotel.rating, reviews: hotel.numReviews,
        type: hotel.kind, amenities: hotel.amenities || [],
        capacity: hotel.apartmentInfo?.capacity,
        image: hotel.images?.[0]?.tmpl?.replace('{size}', '640x400') || item?.image?.[0],
        price: hotel.datelessRate?.amount, currency: hotel.datelessRate?.currency,
        bookingUrl, fetchedAt, sourcePage,
      }, 'ostrovok');
    }).filter(Boolean);
  }
  return schema.map(item => normalizeHotel({
    name: item.name, city, address: item.address?.streetAddress,
    rating: item.aggregateRating?.ratingValue, ratingScale: item.aggregateRating?.bestRating,
    reviews: item.aggregateRating?.reviewCount, stars: item.starRating?.ratingValue,
    type: item['@type'], image: [item.image].flat()[0], bookingUrl: item.url,
    amenities: (item.amenityFeature || []).filter(f => f.value === true || f.value === 'true').map(f => f.name),
    price: parsePrice(item.priceRange), fetchedAt, sourcePage,
  }, 'ostrovok')).filter(Boolean);
}
export async function scrapeOstrovok({ city, ...options }) {
  const sourcePage = catalogUrl(city, 'ostrovok');
  const hotels = parseOstrovok(await fetchHtml(sourcePage, options), { city, sourcePage });
  if (!hotels.length) throw new Error('Карточки не найдены: страница изменилась или доступ ограничен');
  return hotels;
}
