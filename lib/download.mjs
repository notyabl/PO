import fs from 'node:fs/promises';
import path from 'node:path';

const IMAGES_DIR = 'images';

export async function downloadImageFromPage(page, url, id, source) {
  // Принудительно создаем папку, даже если url пустой
  await fs.mkdir(IMAGES_DIR, { recursive: true }).catch(() => {});

  if (!url || !/^https?:\/\//.test(url)) {
    console.log(`  [download] ❌ Нет валидной ссылки (получено: "${url}")`);
    return '';
  }

  const ext = guessExt(url);
  const filename = `${source}-${id}.${ext}`;
  const localPath = path.join(IMAGES_DIR, filename);

  try {
    const response = await page.context().request.get(url, {
      headers: {
        'Referer': page.url(),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000
    });

    if (!response.ok()) {
      console.log(`  [download] ❌ Ошибка сервера ${response.status()} для ${url.substring(0, 50)}...`);
      return url;
    }

    const buffer = await response.body();
    if (buffer.length < 1024) {
      console.log(`  [download] ❌ Файл слишком маленький (заглушка)`);
      return url;
    }

    await fs.writeFile(localPath, buffer);
    console.log(`  [download] ✅ Скачано: ${filename}`);
    return `${IMAGES_DIR}/${filename}`;
  } catch (err) {
    console.log(`  [download] ❌ Ошибка сети: ${err.message}`);
    return url;
  }
}

function guessExt(url) {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'png';
  if (clean.endsWith('.webp')) return 'webp';
  return 'jpg';
}