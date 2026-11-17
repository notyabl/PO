// lib/http.mjs
export async function fetchHtml(url, { timeout = 10000, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, {
    headers: { 
      // Маскируемся под реальный браузер Chrome на Windows
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    },
    signal: AbortSignal.timeout(timeout), 
    redirect: 'follow',
  });
  
  if (!response.ok) {
    throw new Error(`Источник ${url} ответил HTTP ${response.status}`);
  }
  if (!response.headers.get('content-type')?.includes('text/html')) {
    throw new Error(`Источник ${url} не вернул HTML (возможно, это JSON или ошибка)`);
  }
  
  const html = await response.text();
  
  if (html.length > 12_000_000) throw new Error('Страница превышает допустимый размер');
  if (html.length < 200 || /<title>[^<]*(?:captcha|проверка|access denied|just a moment)/i.test(html)) {
    throw new Error('Источник запросил капчу или заблокировал запрос');
  }
  
  return html;
}