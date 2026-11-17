import { load } from 'cheerio';
import { fetchHtml } from './http.mjs';
import { sourceUrl, safeImage } from './sources.mjs';
import { structuredItems } from './structured.mjs';
import { parse101Rooms } from '../adapters/hotels101.mjs';

export function parseRooms(html, hotel) {
  if (hotel.source === 'hotels101') return parse101Rooms(html, hotel);
  const $ = load(html);
  if (hotel.source === 'ostrovok') {
    let data;
    try { data = JSON.parse($('#__NEXT_DATA__').text()).props.pageProps; } catch {}
    // Refuse a redirected or unrelated hotel's content.
    if (!data?.hotel || String(data.hotel.masterId) !== String(hotel.sourceId)) throw new Error('Источник вернул другую страницу отеля');
    return (data.hotel.roomGroups || []).map(room => ({
      name: [room.nameStruct?.mainName, room.nameStruct?.beddingType, room.nameStruct?.bathroom].filter(Boolean).join(' · '),
      area: Number(room.size) || null,
      image: safeImage(room.images?.[0]?.tmpl?.replace('{size}', '640x400')),
      price: null, bookingUrl: hotel.bookingUrl,
    })).filter(room => room.name);
  }
  const rooms = structuredItems($).filter(item => [item['@type']].flat().includes('HotelRoom'));
  return rooms.map(room => ({
    name: room.name,
    area: Number(room.floorSize?.value) || null,
    image: safeImage([room.image].flat()[0]?.url || [room.image].flat()[0]),
    price: null, bookingUrl: sourceUrl(room.url, 'sutochno', hotel.bookingUrl) || hotel.bookingUrl,
  })).filter(room => room.name);
}

export class Rooms {
  constructor({ fetchImpl = fetchHtml, ttl = 30 * 60_000 } = {}) {
    this.fetch = fetchImpl; this.ttl = ttl; this.cache = new Map(); this.pending = new Map();
  }
  get(hotel) {
    const cached = this.cache.get(hotel.id);
    if (cached && Date.now() - Date.parse(cached.fetchedAt) < this.ttl) return Promise.resolve(cached);
    if (this.pending.has(hotel.id)) return this.pending.get(hotel.id);
    const request = this.read(hotel).finally(() => this.pending.delete(hotel.id));
    this.pending.set(hotel.id, request);
    return request;
  }
  async read(hotel) {
    const url = sourceUrl(hotel.bookingUrl, hotel.source);
    if (!url) throw new Error('Нет адреса источника');
    const rooms = hotel.source === 'sutochno' && (hotel.roomName || /номер|комната/i.test(hotel.name))
      ? [{ name: hotel.roomName || hotel.name, area: null, image: hotel.image, price: null, bookingUrl: url }]
      : parseRooms(await this.fetch(url), hotel);
    const result = { rooms, fetchedAt: new Date().toISOString(), availabilityChecked: false };
    if (this.cache.size >= 200) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(hotel.id, result);
    return result;
  }
}
