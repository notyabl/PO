import { chromium } from 'playwright';
import { normalizeHotel } from '../lib/normalize.mjs';
import { downloadImageFromPage } from '../lib/download.mjs';

const CITY_SUBDOMAINS = {
  'москва': 'www',
  'казань': 'kazan',
  'санкт-петербург': 'spb',
  'сочи': 'sochi',
  'ялта': 'yalta',
  'калининград': 'kaliningrad',
};

export async function scrapeSutochno({ city, checkin, checkout }) {
  const subdomain = CITY_SUBDOMAINS[city.toLowerCase()];
  if (!subdomain) return [];

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'ru-RU',
  });

  // Хранилище для перехваченных картинок
  const capturedImages = new Set();
  
  // Слушаем все ответы сети, которые являются картинками
  page.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';
    
    // Если это изображение и оно не является служебным (иконки, логотипы)
    if (contentType.includes('image') && !url.includes('lzy-img.gif') && !url.includes('logo')) {
      // Пытаемся получить расширение или просто сохраняем как jpg
      capturedImages.add(url);
    }
  });

  try {
    const host = `${subdomain}.sutochno.ru`;
    const url = `https://${host}/?checkin=${checkin}&checkout=${checkout}`;
    console.log(`  [sutochno] открываю ${url}`);
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('.card-content', { timeout: 15000 }).catch(() => {});

    // Прокрутка для подгрузки картинок
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let total = 0;
        const timer = setInterval(() => {
          window.scrollBy(0, 500);
          total += 500;
          if (total >= document.body.scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 150);
      });
    });
    await page.waitForTimeout(3000); // Даем время картинкам загрузиться

    // Получаем список всех карточек
    const cards = await page.$$('.card-content');
    const hotels = [];

    // Превращаем Set в массив для удобства
    const imagePool = Array.from(capturedImages);
    console.log(`  [sutochno] перехвачено картинок: ${imagePool.length}`);

    for (const card of cards.slice(0, 10)) {
      const data = await card.evaluate((el) => {
        const titleEl = el.querySelector('.card-content__object-type');
        const linkEl = el.querySelector('a[href*="/hotels/"], a[href*="sutochno.ru/"]');
        const priceEl = el.querySelector('[class*="price"], [class*="Price"]');
        
        // Пытаемся найти data-bg или другие атрибуты
        let imageUrl = '';
        const bgEl = el.querySelector('[data-bg]');
        if (bgEl) imageUrl = bgEl.getAttribute('data-bg');

        return {
          name: titleEl?.textContent?.trim() || '',
          bookingUrl: linkEl?.href || '',
          image: imageUrl,
          priceRaw: priceEl?.textContent?.trim() || '',
        };
      });

      if (!data.name || !data.bookingUrl) continue;

      const price = parseInt(data.priceRaw.replace(/\D/g, '')) || 0;
      
      // Если в карточке нет прямой ссылки на картинку, берём из перехваченных
      if (!data.image && imagePool.length > 0) {
        // Берем следующую картинку из пула (примерное соответствие)
        data.image = imagePool.shift(); 
      }

      console.log(`  [sutochno] Картинка: ${data.image ? data.image.substring(0, 50) + '...' : 'НЕТ'}`);
      const localImage = await downloadImageFromPage(page, data.image, hotels.length + 1, 'sutochno');

      hotels.push(normalizeHotel({
        name: data.name,
        city: city,
        price: price,
        type: 'apart',
        image: localImage,
        bookingUrl: data.bookingUrl,
      }, 'sutochno'));
    }

    console.log(`  [sutochno] ✓ ${hotels.length} объектов`);
    return hotels;
  } catch (err) {
    console.warn(`  [sutochno] ошибка: ${err.message}`);
    return [];
  } finally {
    await browser.close();
  }
}