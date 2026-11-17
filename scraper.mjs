import fs from 'node:fs/promises';
import { Catalog } from './lib/catalog.mjs';
import { validateSearch, findCity } from './lib/sources.mjs';
import { parseOstrovok } from './adapters/ostrovok.mjs';
import { parseSutochno } from './adapters/sutochno.mjs';
import { parse101Hotels } from './adapters/hotels101.mjs';

try {
  const args = process.argv.slice(2);
  const catalog = await new Catalog().load();
  if (args[0] === '--import') {
    const [, source, city, file] = args;
    const parse = { ostrovok: parseOstrovok, sutochno: parseSutochno, hotels101: parse101Hotels }[source];
    if (!parse || !findCity(city) || !file) throw new Error('Импорт: npm run scrape -- --import sutochno "Москва" saved.html');
    await catalog.import(findCity(city).name, source, parse(await fs.readFile(file, 'utf8'), { city: findCity(city).name }));
    console.log('HTML импортирован; цены справочные, дата исходной страницы неизвестна.');
  } else {
    const [checkin, checkout, adults, ...cities] = args;
    if (!cities.length) throw new Error('Запуск: npm run scrape -- ЗАЕЗД ВЫЕЗД ГОСТИ "ГОРОД" ["ГОРОД"...]');
    const queries = cities.map(city => validateSearch({ checkin, checkout, adults, city }, { requireCity: true }));
    console.log('Загружаем публичный каталог. Цены «от» справочные, наличие на даты не проверяется.');
    for (const query of queries) {
      const result = await catalog.refresh(query.city);
      for (const status of result.statuses) {
        console.log(status.city + ' / ' + status.source + ': ' + status.status + ', ' + status.count + ' карточек' + (status.message ? ' — ' + status.message : ''));
        if (status.status !== 'ok') process.exitCode = 1;
      }
    }
    console.log('Каталог сохранён: ' + catalog.snapshot.hotels.length + ' карточек. Неуспешные источники не стирают прошлую выгрузку.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
