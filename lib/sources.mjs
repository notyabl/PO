export const CITIES = [
  { name: 'Москва', ostrovok: 'moscow', sutochno: 'www', hotels101: 'moskva' },
  { name: 'Санкт-Петербург', ostrovok: 'st._petersburg', sutochno: 'spb', hotels101: 'sankt-peterburg' },
  { name: 'Казань', ostrovok: 'kazan', sutochno: 'kazan', hotels101: 'kazan' },
  { name: 'Сочи', ostrovok: 'sochi', sutochno: 'sochi', hotels101: 'sochi' },
  { name: 'Ялта', ostrovok: 'yalta', sutochno: 'yalta', hotels101: 'yalta' },
  { name: 'Калининград', ostrovok: 'kaliningrad', sutochno: 'kaliningrad', hotels101: 'kaliningrad' },
  { name: 'Краснодар', ostrovok: 'krasnodar', sutochno: 'krasnodar', hotels101: 'krasnodar' },
  { name: 'Волгоград', ostrovok: 'volgograd', sutochno: 'volgograd', hotels101: 'volgograd' },
  { name: 'Ростов-на-Дону', ostrovok: 'rostov-on-don', sutochno: 'rostov', hotels101: 'rostov-na-donu' },
];
export const cityKey = value => String(value || '').trim().toLowerCase().replaceAll('ё', 'е');
export const findCity = value => CITIES.find(city => cityKey(city.name) === cityKey(value));

export function sourceUrl(value, source, base) {
  if (!value) return '';
  try {
    const url = new URL(value, base);
    const domain = ({ ostrovok: 'ostrovok.ru', sutochno: 'sutochno.ru', hotels101: '101hotels.com' }[source] || '');
    if (!domain || url.protocol !== 'https:' || url.username || url.password ||
        !(url.hostname === domain || url.hostname.endsWith('.' + domain))) return '';
    if (source === 'sutochno') {
      url.pathname = url.pathname.replace(/^\/front\/searchapp\/detail\/(\d+)\/?$/, '/$1');
      if (!/^\/(?:hotels\/)?\d+\/?$/.test(url.pathname)) return '';
    } else if (source === 'hotels101') {
      if (!/^\/main\/cities\/[a-z0-9_-]+\/[a-z0-9_-]+\.html$/.test(url.pathname)) return '';
    } else if (!/^\/hotel\/.+\/mid\d+\/.+/.test(url.pathname)) return '';
    url.search = ''; url.hash = '';
    return url.href;
  } catch { return ''; }
}

export function safeImage(value, base) {
  if (!value) return '';
  try {
    const url = new URL(value, base);
    return url.protocol === 'https:' && !/\.(?:svg|gif)(?:$|\?)/i.test(url.href) ? url.href : '';
  } catch { return ''; }
}

export function validateSearch(input, { requireCity = false } = {}) {
  const city = String(input.city || '').trim();
  if ((requireCity || city) && !findCity(city)) throw new Error('Выберите город из списка направлений.');
  const checkin = String(input.checkin || ''), checkout = String(input.checkout || '');
  const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  if (!validDate(checkin) || !validDate(checkout) || checkout <= checkin) throw new Error('Выезд должен быть позже заезда.');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (checkin < today) throw new Error('Дата заезда не может быть в прошлом.');
  const adults = Number(input.adults);
  if (!Number.isInteger(adults) || adults < 1 || adults > 4) throw new Error('Выберите от 1 до 4 гостей.');
  return { city: city ? findCity(city).name : '', checkin, checkout, adults };
}

export function catalogUrl(city, source) {
  const config = findCity(city);
  if (!config) throw new Error('Неизвестный город: ' + city);
  if (source === 'hotels101') return `https://101hotels.com/main/cities/${config.hotels101}`;
  return source === 'ostrovok'
    ? `https://ostrovok.ru/hotel/russia/${config.ostrovok}/`
    : `https://${config.sutochno}.sutochno.ru/hotels`;
}
