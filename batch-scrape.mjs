// batch-scrape.mjs
import { Catalog } from './lib/catalog.mjs';

// Ваш список городов
const CITIES = [
  'Москва', 
  'Санкт-Петербург', 
  'Казань', 
  'Сочи', 
  'Ялта', 
  'Калининград', 
  'Краснодар', 
  'Волгоград', 
  'Ростов-на-Дону'
];

async function runBatch() {
  console.log('Запуск пакетного парсинга всех городов...');
  
  // Инициализируем каталог и загружаем текущие данные
  const catalog = await new Catalog().load();

  for (const city of CITIES) {
    console.log(`\n========================================`);
    console.log(`Начинаем парсинг города: ${city}`);
    console.log(`========================================`);
    
    try {
      // Принудительно обновляем данные для города
      await catalog.refresh(city);
      console.log(`Город ${city} успешно обработан и сохранен в hotels.json`);
    } catch (error) {
      console.error(`Ошибка при парсинге города ${city}:`, error.message);
    }
  }
  
  console.log('\nВсе города из списка обработаны!');
}

runBatch();