import { chromium } from 'playwright';
import { normalizeHotel } from '../lib/normalize.mjs';
import { downloadImageFromPage } from '../lib/download.mjs';

export async function scrapeOstrovok({ city, checkin, checkout, adults = 2 }) {
  // Островок часто блокирует headless, поэтому ставим false (откроется окно)
  const browser = await chromium.launch({ 
    headless: false, 
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'ru-RU',
  });

  try {
    const url = `https://ostrovok.ru/hotel/russia/?q=${encodeURIComponent(city)}&dates=${checkin}-${checkout}&guests=${adults}`;
    console.log(`  [ostrovok] открываю ${url}`);
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    
    // Ждем загрузки
    await page.waitForSelector('[data-testid="hotel-card"], [class*="HotelCard_wrapper"]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const cards = await page.$$('[data-testid="hotel-card"], [class*="HotelCard_wrapper"]');

    if (!cards.length) {
      console.warn(`  [ostrovok] Карточки не найдены (возможно, капча).`);
      return [];
    }

    const hotels = [];
    for (const card of cards.slice(0, 10)) {
      const data = await card.evaluate((el) => {
        const titleEl = el.querySelector('[data-testid="hotel-name"], h3, h2');
        const linkEl = el.querySelector('a[href*="/hotel/"]');
        const priceEl = el.querySelector('[data-testid="price"], [class*="price"]');
        const ratingEl = el.querySelector('[data-testid="rating"], [class*="rating"]');

        // Ищем картинку
        let imageUrl = '';
        const imgElements = Array.from(el.querySelectorAll('img'));
        for (const img of imgElements) {
          const src = img.getAttribute('src') || img.getAttribute('data-src');
          if (src && !src.startsWith('data:image')) {
            imageUrl = src;
            break;
          }
        }
        if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;

        return {
          name: titleEl?.textContent?.trim() || '',
          bookingUrl: linkEl?.href || '',
          image: imageUrl,
          priceRaw: priceEl?.textContent?.trim() || '',
          ratingRaw: ratingEl?.textContent?.trim() || '',
        };
      });

      if (!data.name || !data.bookingUrl) continue;

      const price = parseInt(data.priceRaw.replace(/\D/g, '')) || 0;
      const ratingMatch = data.ratingRaw.match(/(\d{1,2}[.,]\d)/);
      const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(',', '.')) : 0;
      
      console.log(`  [ostrovok] Найдена картинка: ${data.image ? data.image.substring(0, 50) + '...' : 'НЕТ'}`);
      const localImage = await downloadImageFromPage(page, data.image, hotels.length + 1, 'ostrovok');

      hotels.push(normalizeHotel({
        name: data.name,
        city,
        price,
        rating,
        type: 'hotel',
        image: localImage,
        bookingUrl: data.bookingUrl,
      }, 'ostrovok'));
    }

    console.log(`  [ostrovok] ✓ ${hotels.length} отелей`);
    return hotels;
  } catch (err) {
    console.warn(`  [ostrovok] ошибка: ${err.message}`);
    return [];
  } finally {
    await browser.close();
  }
}