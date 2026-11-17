// lib/catalog.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrapeSutochno } from '../adapters/sutochno.mjs';
import { scrape101Hotels } from '../adapters/hotels101.mjs';
import { dedupe } from './dedupe.mjs';
import { cityKey } from './sources.mjs';

export const catalogFile = fileURLToPath(new URL('../hotels.json', import.meta.url));

export class Catalog {
  constructor({ file = catalogFile, adapters = { hotels101: scrape101Hotels, sutochno: scrapeSutochno }, ttl = 30 * 60_000 } = {}) {
    this.file = file; this.adapters = adapters; this.ttl = ttl;
    this.snapshot = { version: 2, updatedAt: null, hotels: [], statuses: [] };
    this.pending = new Map();
    this.writes = Promise.resolve();
  }

  async load() {
    try {
      const data = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (data.version === 2 && Array.isArray(data.hotels) && Array.isArray(data.statuses)) {
        this.snapshot = data;
        this.snapshot.hotels = data.hotels.map(hotel => hotel.priceKind === 'reference'
          ? { ...hotel, referencePrice: hotel.price || null, referencePricePeriod: 'night', price: null, priceKind: 'unknown', pricePeriod: null }
          : hotel);
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return this;
  }

  select(city = '') {
    return {
      ...this.snapshot,
      hotels: this.snapshot.hotels.filter(h => !city || cityKey(h.city) === cityKey(city)),
      statuses: this.snapshot.statuses.filter(s => !city || cityKey(s.city) === cityKey(city)),
    };
  }

  async search(query) {
    if (query.city) {
      const statuses = this.select(query.city).statuses;
      const fresh = Object.keys(this.adapters).every(source => statuses.some(s => s.source === source && Date.now() - Date.parse(s.checkedAt) < this.ttl));
      if (!fresh) await this.refresh(query.city);
    }
    return { ...this.select(), query, priceMode: 'source-only', availabilityChecked: false };
  }

  refresh(city) {
    if (this.pending.has(city)) return this.pending.get(city);
    const work = this.collect(city).finally(() => this.pending.delete(city));
    this.pending.set(city, work);
    return work;
  }

  async collect(city) {
    const sources = Object.entries(this.adapters);
    const results = await Promise.allSettled(sources.map(([, adapter]) => adapter({ city })));
    const checkedAt = new Date().toISOString();
    
    results.forEach((result, i) => {
      const source = sources[i][0];
      
      // ЛОГИРОВАНИЕ РЕЗУЛЬТАТОВ
      if (result.status === 'fulfilled') {
        console.log(`✅ [${source}] Успешно спаршено отелей: ${result.value.length}`);
      } else {
        console.error(`❌ [${source}] Ошибка парсинга:`, result.reason.message);
      }
      
      const same = item => item.source === source && cityKey(item.city) === cityKey(city);
      const hotels = result.status === 'fulfilled' ? dedupe(result.value) : [];
      const success = hotels.length > 0;
      const previous = this.snapshot.hotels.filter(same);
      
      if (success) this.snapshot.hotels = [...this.snapshot.hotels.filter(h => !same(h)), ...hotels];
      
      const status = {
        source, city, checkedAt, status: success ? 'ok' : 'unavailable',
        count: success ? hotels.length : previous.length,
        lastSuccessAt: success ? checkedAt : this.snapshot.statuses.find(same)?.lastSuccessAt || null,
        message: success ? '' : result.status === 'rejected' ? errorMessage(result.reason) : 'Источник не вернул карточки',
      };
      this.snapshot.statuses = [...this.snapshot.statuses.filter(s => !same(s)), status];
    });
    
    this.snapshot.updatedAt = checkedAt;
    await this.save();
    return this.select(city);
  }

  async import(city, source, hotels) {
    // ... (оставляем без изменений)
    const valid = dedupe(hotels).filter(h => h.source === source && cityKey(h.city) === cityKey(city));
    if (!valid.length) throw new Error('Импорт не содержит распознанных карточек; каталог сохранён');
    const same = item => item.source === source && cityKey(item.city) === cityKey(city);
    const checkedAt = new Date().toISOString();
    this.snapshot.hotels = [...this.snapshot.hotels.filter(h => !same(h)), ...valid.map(h => ({ ...h, fetchedAt: null, importedAt: checkedAt }))];
    this.snapshot.statuses = [...this.snapshot.statuses.filter(s => !same(s)), {
      city, source, status: 'imported', checkedAt, lastSuccessAt: null, count: valid.length,
      message: 'Импорт HTML: время сохранения исходной страницы неизвестно',
    }];
    this.snapshot.updatedAt = checkedAt;
    await this.save();
  }

  save() {
    // ... (оставляем без изменений)
    const json = JSON.stringify(this.snapshot, null, 2) + '\n';
    this.writes = this.writes.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await fs.writeFile(this.file + '.tmp', json);
      await fs.rename(this.file + '.tmp', this.file);
    });
    return this.writes;
  }
}

function errorMessage(error) {
  if (/timeout|fetch failed|abort/i.test(error?.message || '')) return 'Источник недоступен или не ответил вовремя';
  return String(error?.message || 'Не удалось прочитать источник').slice(0, 200);
}