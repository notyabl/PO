import fs from 'node:fs/promises';
// import { scrapeOstrovok } from './adapters/ostrovok.mjs'; // Временно отключено
import { scrapeSutochno } from './adapters/sutochno.mjs';
import { dedupe } from './lib/dedupe.mjs';

const args = process.argv.slice(2);
if (args.length < 4) {
  console.log('Использование: node scraper.mjs ЗАЕЗД ВЫЕЗД ГОСТИ ГОРОД [ГОРОД...]');
  process.exit(1);
}

const [checkin, checkout, adultsArg, ...cities] = args;
const adults = Number(adultsArg) || 2;

const collected = [];

for (const city of cities) {
  console.log(`\n→ ${city}`);

  // try {
  //   const fromOstrovok = await scrapeOstrovok({ city, checkin, checkout, adults });
  //   collected.push(...fromOstrovok);
  // } catch (err) {
  //   console.warn(`  [ostrovok] пропущен: ${err.message}`);
  // }

  await sleep(1000); // Небольшая пауза

  try {
    const fromSutochno = await scrapeSutochno({ city, checkin, checkout });
    collected.push(...fromSutochno);
  } catch (err) {
    console.warn(`  [sutochno] пропущен: ${err.message}`);
  }

  await sleep(2000);
}

console.log(`\nСобрано «сырых» записей: ${collected.length}`);
const unique = dedupe(collected);
console.log(`После дедупликации: ${unique.length}`);

await fs.writeFile('hotels.json', JSON.stringify(unique, null, 2), 'utf8');
console.log(`Готово → hotels.json (${unique.length} отелей)`);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}