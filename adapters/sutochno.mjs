// adapters/sutochno.mjs
import { load } from 'cheerio';
import { normalizeHotel, parsePrice, numberValue } from '../lib/normalize.mjs';
import { catalogUrl, sourceUrl, safeImage } from '../lib/sources.mjs';
import { fetchHtml } from '../lib/http.mjs';
import { structuredItems } from '../lib/structured.mjs';
import { dedupe } from '../lib/dedupe.mjs';

// Вспомогательная функция для безопасного доступа к глубоким свойствам JSON
function getNested(obj, path) {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

export function parseSutochno(html, { city, sourcePage = catalogUrl(city, 'sutochno'), fetchedAt } = {}) {
  const $ = load(html), hotels = [];

  // === БЛОК 1: Пытаемся спарсить JSON из Next.js ===
  const nextDataRaw = $('#__NEXT_DATA__').html();
  if (nextDataRaw) {
    try {
      const nextData = JSON.parse(nextDataRaw);
      // Ищем массив с отелями. Путь может отличаться, но обычно это что-то вроде:
      // props.pageProps.initialState.search.result или props.pageProps.searchResult.items
      // Если он не найден, мы просто пойдем дальше и спарсим HTML.
      
      // Попробуйте разные пути, если этот не сработает:
      // const rawHotels = getNested(nextData, 'props.pageProps.initialState.search.result') || 
      //                   getNested(nextData, 'props.pageProps.searchResult.items') || [];

      const rawHotels = getNested(nextData, 'props.pageProps.initialState.search.result') || [];

      if (Array.isArray(rawHotels) && rawHotels.length > 0) {
         console.log(`[Суточно] Найдены данные в JSON (${rawHotels.length} шт.)`);
         for (const item of rawHotels) {
            // ВНИМАНИЕ: Здесь нужно проверить, как именно называются поля в JSON у Суточно.ру.
            // Обычно это id, name, address, price и т.д.
            const bookingUrl = sourceUrl(item.url || `/object/${item.id}`, 'sutochno', sourcePage);
            
            hotels.push(normalizeHotel({
              name: item.name || item.title,
              city,
              bookingUrl,
              address: item.address?.title || item.address,
              image: item.images?.[0]?.url || item.image,
              rating: item.rating || item.ratingValue,
              reviews: item.reviewsCount || item.reviews,
              price: item.price?.value || item.price,
              capacity: item.guests || item.capacity,
              // Если тип не указан, попробуем угадать по названию
              type: /апартамент|квартира/i.test(item.name || '') ? 'apart' : 'hotel',
              fetchedAt, 
              sourcePage,
            }, 'sutochno'));
         }
         if (hotels.length > 0) return dedupe(hotels);
      }
    } catch (e) {
      console.warn('[Суточно] Не удалось распарсить __NEXT_DATA__, переключаемся на HTML парсер:', e.message);
    }
  }

  // === БЛОК 2: Старый парсер HTML (Сработает, если JSON не найден) ===
  $('.card-content').each((_, element) => {
    const card = $(element).closest('.card, .search-result, [data-object-id]');
    const root = card.length ? card : $(element);
    const text = root.find('*').addBack().contents().filter((_, node) => node.type === 'text')
      .map((_, node) => $(node).text()).get().join(' ').replace(/\s+/g, ' ').trim();
    const urls = root.find('a[href]').toArray()
      .map(link => sourceUrl($(link).attr('href'), 'sutochno', sourcePage)).filter(Boolean);
    const bookingUrl = urls.find(url => /^\/\d+\/?$/.test(new URL(url).pathname)) || urls[0];
    if (!bookingUrl) return;
    const roomName = root.find('.card-content__object-type, [itemprop="name"]').first().text().trim();
    const hotelName = root.find('.card-content__hotel-name, .card-content__hotel, [class*="hotel-name"]').first().text().trim();
    const name = hotelName || roomName;
    if (!name) return;
    const images = root.find('img, [data-bg]').toArray().map(image => {
      const el = $(image);
      return safeImage(el.attr('data-src') || el.attr('src') || el.attr('data-bg'), sourcePage);
    }).filter(Boolean);
    const rating = root.find('[itemprop="ratingValue"], .card-content__rating, [class*="rating-value"]').first();
    const stars = root.find('[itemprop="starRating"], [data-stars]').first();
    const dailyPrice = text.match(/(\d[\d\s\u00a0\u202f]*(?:[.,]\d{1,2})?\s*₽)\s*за\s*сутки/i)?.[1];
    hotels.push(normalizeHotel({
      name, roomName: hotelName ? roomName : '', city, bookingUrl,
      sourceId: new URL(bookingUrl).pathname.split('/').filter(Boolean).at(-1),
      address: root.find('.card-content__address, [itemprop="streetAddress"]').first().text().trim(),
      image: images[0], price: parsePrice(dailyPrice), rating: rating.attr('content') || rating.text(),
      reviews: text.match(/(\d+)\s*отзыв/i)?.[1],
      capacity: text.match(/(\d+)\s*гост(?:ь|я|ей)/i)?.[1],
      stars: stars.attr('data-stars') || stars.attr('content') || stars.text(),
      type: /апартамент|квартира/i.test(name + roomName) ? 'apart' : 'hotel',
      amenities: root.find('[title], [aria-label], .card-content__meal').toArray()
        .map(el => $(el).attr('title') || $(el).attr('aria-label') || $(el).text()),
      fetchedAt, sourcePage,
    }, 'sutochno'));
  });

  // === БЛОК 3: Structured Data (JSON-LD) ===
  for (const item of structuredItems($)) {
    const bookingUrl = sourceUrl(item.url || item['@id'], 'sutochno', sourcePage);
    if (!bookingUrl || hotels.some(h => h?.bookingUrl === bookingUrl)) continue;
    const features = (item.amenityFeature || []).filter(f => f.value === true || f.value === 'true');
    const nightly = [item.offers].flat().filter(Boolean).find(o => ['DAY', 'NI', 'NIGHT'].includes(o.priceSpecification?.unitCode));
    hotels.push(normalizeHotel({
      name: item.name, city, bookingUrl,
      address: item.address?.streetAddress, image: [item.image].flat()[0]?.url || [item.image].flat()[0],
      rating: item.aggregateRating?.ratingValue, ratingScale: item.aggregateRating?.bestRating,
      reviews: item.aggregateRating?.reviewCount, stars: item.starRating?.ratingValue,
      type: item['@type'], amenities: features.map(f => f.name),
      capacity: numberValue(item.occupancy?.maxValue),
      price: nightly?.priceSpecification?.price || nightly?.price, currency: nightly?.priceCurrency,
      fetchedAt, sourcePage,
    }, 'sutochno'));
  }

  return dedupe(hotels);
}

export async function scrapeSutochno({ city, ...options }) {
  const sourcePage = catalogUrl(city, 'sutochno');
  const hotels = parseSutochno(await fetchHtml(sourcePage, options), { city, sourcePage });
  if (!hotels.length) throw new Error('Карточки не найдены: страница изменилась или доступ ограничен');
  return hotels;
}