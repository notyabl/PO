import { load } from 'cheerio';
import { normalizeHotel } from '../lib/normalize.mjs';
import { catalogUrl, sourceUrl } from '../lib/sources.mjs';
import { fetchHtml } from '../lib/http.mjs';

export function parse101Hotels(html, { city, sourcePage = catalogUrl(city, 'hotels101'), fetchedAt } = {}) {
  const $ = load(html);
  const hotels = [];
  $('.hotellist > li[itemtype$="/Hotel"]').each((_, element) => {
    const card = $(element);
    const bookingUrl = sourceUrl(card.find('a[itemprop="url"]').attr('href'), 'hotels101', sourcePage);
    if (!bookingUrl) return;
    const amenities = card.find('[itemprop="amenityFeature"]').toArray().filter(feature =>
      String($(feature).find('[itemprop="value"]').attr('content')).toLowerCase() === 'true'
    ).map(feature => $(feature).find('[itemprop="name"]').attr('content'));
    const ratingNode = card.find('[itemprop="ratingValue"]').first().clone();
    ratingNode.children().remove();
    const name = card.find('a[itemprop="url"] [itemprop="name"]').first().text().trim();
    // priceRange is the catalog's average nightly price. The visible amount on dated
    // pages can be a preliminary whole-stay sum; it is not a confirmed tariff.
    const reference = card.find('[itemprop="priceRange"]').attr('content') || '';
    const amount = reference.match(/([\d\s]+)\s*руб/)?.[1]?.replace(/\s/g, '');
    const hotel = normalizeHotel({
      name, city, bookingUrl, sourceId: card.find('[data-hotel-id]').first().attr('data-hotel-id'),
      address: card.find('[itemprop="streetAddress"]').text().trim(),
      image: card.find('img[itemprop="image"]').first().attr('src'),
      stars: card.find('.stars').attr('class')?.match(/stars_(\d)/)?.[1],
      rating: ratingNode.text().trim(), ratingScale: card.find('[itemprop="bestRating"]').first().text(),
      reviews: card.find('[itemprop="reviewCount"]').attr('content'),
      type: name, amenities, price: amount, currency: 'RUB', sourcePage, fetchedAt,
    }, 'hotels101');
    if (hotel) hotels.push(hotel);
  });
  return hotels;
}

export async function scrape101Hotels({ city, ...options }) {
  const sourcePage = catalogUrl(city, 'hotels101');
  const hotels = parse101Hotels(await fetchHtml(sourcePage, options), { city, sourcePage });
  if (!hotels.length) throw new Error('101Hotels не вернул карточки каталога');
  return hotels;
}

export function parse101Rooms(html, hotel) {
  const $ = load(html);
  const canonical = sourceUrl($('link[rel="canonical"]').attr('href'), 'hotels101');
  if (canonical !== sourceUrl(hotel.bookingUrl, 'hotels101')) throw new Error('Источник вернул другую страницу');
  return $('.room-name-cell[data-room-id]').toArray().map(element => {
    const room = $(element);
    return {
      name: room.find('.room-name').text().trim(),
      area: Number(room.find('.room-space').text().match(/([\d.,]+)\s*м/)?.[1]?.replace(',', '.')) || null,
      image: room.find('.room__img').first().attr('src') || '',
      capacity: Number(room.closest('tr').find('[data-max-occupancy]').attr('data-max-occupancy')) || null,
      price: null, bookingUrl: hotel.bookingUrl,
    };
  }).filter(room => room.name);
}
