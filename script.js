import { filterHotels, bookingUrl } from './lib/search.mjs';
import { validateSearch } from './lib/sources.mjs';
import { createApiClient, readJsonResponse, API_UNAVAILABLE } from './lib/client-api.mjs';
const api = createApiClient();

const AMENITY_LABEL = {
  wifi: 'Wi-Fi', breakfast: 'Завтрак', pool: 'Бассейн',
  spa: 'Спа', parking: 'Парковка', gym: 'Фитнес',
};
const TYPE_LABEL = {
  hotel: 'Отель', apart: 'Апартаменты', villa: 'Вилла', guest: 'Гостевой дом',
  hostel: 'Хостел', sanatorium: 'Санаторий', resort: 'Курортный отель', living: 'Меблированные комнаты',
};
const SOURCE_LABEL = {
  ostrovok: 'Островок', hotels101: '101Hotels', sutochno: 'Суточно.ру',
};

let HOTELS = [];
let MAX_PRICE = 30000;
let isLoading = false;
let userTouchedPrice = false;
let statuses = [];
let staticMode = false;
let searchError = '';
let requestId = 0;
const roomCache = new Map();

const state = {
  city: '', adults: 2, priceLimited: false, maxPrice: MAX_PRICE, stars: new Set(), rating: 0,
  amenities: new Set(), types: new Set(), sources: new Set(), sort: 'popular', favorites: new Set(),
};

const searchForm    = document.getElementById('searchForm');
const cityInput     = document.getElementById('cityInput');
const checkinInput  = document.getElementById('checkin');
const checkoutInput = document.getElementById('checkout');
const guestsSelect  = document.getElementById('guests');
const priceRange    = document.getElementById('priceRange');
const priceValue    = document.getElementById('priceValue');
const sortSelect    = document.getElementById('sort');
const hotelsEl      = document.getElementById('hotels');
const countEl       = document.getElementById('resultsCount');
const emptyEl       = document.getElementById('empty');
const loadingEl     = document.getElementById('loading');
const disclaimerEl = document.getElementById('sourceStatus');
const resetBtn      = document.getElementById('resetBtn');
const emptyResetBtn = document.getElementById('emptyResetBtn');

const money = (n) => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
const esc = (str) => String(str ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function plural(n, forms) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

function initDates() {
  const today = new Date();
  const checkout = new Date(today);
  checkout.setDate(checkout.getDate() + 3);
  const iso = (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  const min = iso(today);
  checkinInput.value = min;
  checkinInput.min = min;
  checkoutInput.value = iso(checkout);
  updateCheckoutMin();
}

function currentQuery() {
  return {
    city: cityInput.value.trim(), checkin: checkinInput.value,
    checkout: checkoutInput.value, adults: Number(guestsSelect.value.match(/\d+/)?.[0] || 2),
  };
}

function updateCheckoutMin() {
  const date = new Date(checkinInput.value + 'T12:00:00');
  if (!Number.isFinite(date.getTime())) return;
  date.setDate(date.getDate() + 1);
  const min = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  checkoutInput.min = min;
  if (checkoutInput.value <= checkinInput.value) checkoutInput.value = min;
}

async function loadHotels(query = currentQuery()) {
  let data;
  try {
    data = await api.request('hotels', query);
    staticMode = false;
  } catch (error) {
    if (error.message !== API_UNAVAILABLE) throw error;
    staticMode = true;
    const response = await fetch('hotels.json', { cache: 'no-store' });
    data = await readJsonResponse(response, 'Не удалось открыть сохранённую подборку.');
  }
  if (data.version !== 2 || !Array.isArray(data.hotels)) throw new Error('Подборка недоступна. Откройте Dingo по адресу http://127.0.0.1:3010.');
  return data;
}

function renderStatus() {
  const visibleStatuses = statuses.filter(s => !state.city || s.city.toLowerCase().includes(state.city));
  const unavailable = [...new Set(visibleStatuses.filter(s => s.status === 'unavailable').map(s => SOURCE_LABEL[s.source] || s.source))];
  const imported = visibleStatuses.some(s => s.status === 'imported') || HOTELS.some(h => h.importedAt && (!state.city || h.city.toLowerCase().includes(state.city)));
  const updates = HOTELS.filter(h => !state.city || h.city.toLowerCase().includes(state.city)).map(h => h.fetchedAt).filter(Boolean).sort();
  const updated = updates[0] ? new Date(updates[0]).toLocaleString('ru-RU') : '';
  disclaimerEl.textContent = 'Цены на выбранные даты и состав гостей уточняются у источника. Фильтр цены и сортировка используют справочный ориентир из каталога. ' +
    (updated ? 'Данные от ' + updated + '. ' : '') +
    (staticMode ? 'Открыта сохранённая подборка. Для обновления и просмотра номеров перейдите на http://127.0.0.1:3010. ' : '') +
    (imported ? 'Часть данных импортирована из HTML; дата исходной страницы неизвестна. ' : '') +
    (unavailable.length ? 'Сейчас недоступны: ' + unavailable.join(', ') + '. Показаны последние сохранённые данные, если они есть. ' : '') +
    (searchError ? searchError + ' Показана сохранённая подборка.' : 'Бронирование — на сайте источника.');
}

function updatePriceBounds() {
  const maxInData = Math.max(0, ...HOTELS.map((h) => h.referencePrice ?? (h.priceKind === 'reference' ? h.price : 0) ?? 0));
  MAX_PRICE = Math.max(1000, Math.ceil(maxInData / 1000) * 1000);
  if (!userTouchedPrice) state.maxPrice = MAX_PRICE;
  if (state.maxPrice > MAX_PRICE) state.maxPrice = MAX_PRICE;
  state.priceLimited = state.maxPrice < MAX_PRICE;
  priceRange.max = MAX_PRICE;
  priceRange.value = state.maxPrice;
  updatePriceLabel();
}

function updatePriceLabel() {
  priceValue.textContent =
    state.maxPrice >= MAX_PRICE ? 'Любая' : `до ${money(state.maxPrice)}`;
}

function getFilteredHotels() {
  return filterHotels(HOTELS, state);
}

function cardHTML(hotel) {
  const isFav = state.favorites.has(hotel.id);
  const imgSrc = hotel.image || '';
  const media = imgSrc
    ? `<img src="${esc(imgSrc)}" alt="${esc(hotel.name)}" loading="lazy" onerror="this.style.display='none'" />`
    : `<div class="card__media-placeholder">${esc((hotel.name || '?').charAt(0))}</div>`;

  const amenities = (hotel.amenities || []).slice(0, 4)
    .map((a) => `<li>${AMENITY_LABEL[a] || esc(a)}</li>`).join('');

  const stars = hotel.stars > 0 ? '★'.repeat(Math.min(hotel.stars, 5)) : '';
  const price = '<b>Уточнить цену</b><span>на выбранные даты</span>';


  const reviews = hotel.reviews > 0
    ? `<div class="card__reviews">${hotel.reviews} ${plural(hotel.reviews, ['отзыв', 'отзыва', 'отзывов'])}</div>`
    : '<div class="card__reviews"></div>';

  const sourceBadge = hotel.source && SOURCE_LABEL[hotel.source]
    ? `<span class="card__source">${SOURCE_LABEL[hotel.source]}</span>` : '';

  return `
    <article class="card" data-id="${esc(hotel.id)}">
      <div class="card__media">
        ${media}
        <span class="card__type">${esc(TYPE_LABEL[hotel.type] || 'Отель')}</span>
        <button class="card__fav ${isFav ? 'is-active' : ''}" type="button"
                data-fav="${esc(hotel.id)}" aria-label="В избранное" aria-pressed="${isFav}">${isFav ? '♥' : '♡'}</button>
      </div>
      <div class="card__body">
        <div class="card__top">
          <span class="card__stars">${stars}</span>
          ${hotel.rating > 0
            ? `<span class="card__rating ${hotel.rating >= 9 ? 'is-great' : ''}">${hotel.rating.toFixed(1)}</span>`
            : ''}
        </div>
        <h3 class="card__title">${esc(hotel.name)}</h3>
        <p class="card__city">${esc(hotel.city)}${hotel.address ? ' · ' + esc(hotel.address) : hotel.district ? ' · ' + esc(hotel.district) : ''}</p>
        ${hotel.roomName ? `<p class="card__city">${esc(hotel.roomName)}</p>` : ''}
        <details data-rooms="${esc(hotel.id)}"><summary class="link-btn">Номера</summary><div class="card__city">Загружаем сведения…</div></details>
        ${amenities ? `<ul class="card__amenities">${amenities}</ul>` : ''}
        <div class="card__footer">
          ${reviews}
          <div class="card__price">${price}${sourceBadge}</div>
        </div>
        <div class="card__actions">
          <button class="btn btn--primary" type="button" data-book="${esc(hotel.id)}">Забронировать</button>
        </div>
      </div>
    </article>
  `;
}

function render() {
  renderStatus();
  if (isLoading) {
    loadingEl.classList.add('is-visible');
    emptyEl.classList.remove('is-visible');
    hotelsEl.innerHTML = '';
    countEl.textContent = 'Загрузка…';
    return;
  }
  loadingEl.classList.remove('is-visible');

  const list = getFilteredHotels();
  countEl.innerHTML = `Найдено <b>${list.length}</b> ${plural(list.length, ['вариант', 'варианта', 'вариантов'])}`;
  hotelsEl.innerHTML = list.map(cardHTML).join('');
  emptyEl.classList.toggle('is-visible', list.length === 0);
}

function resetFilters() {
  state.city = '';
  state.maxPrice = MAX_PRICE;
  state.stars.clear();
  state.rating = 0;
  state.amenities.clear();
  state.types.clear();
  state.sources.clear();
  userTouchedPrice = false;
  state.priceLimited = false;

  cityInput.value = '';
  priceRange.value = MAX_PRICE;
  updatePriceLabel();

  document.querySelectorAll('[data-stars], [data-amenity], [data-type], [data-source]')
    .forEach((cb) => { cb.checked = false; });

  document.querySelectorAll('.pill').forEach((pill) => {
    pill.classList.toggle('is-active', pill.dataset.rating === '0');
  });

  render();
}

searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  let query;
  try { query = validateSearch(currentQuery()); }
  catch (error) { searchError = error.message; render(); return; }
  const id = ++requestId;
  state.city = query.city.toLowerCase();
  state.adults = query.adults;
  searchError = '';
  isLoading = true;
  render();
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const data = await loadHotels(query);
    if (id !== requestId) return;
    HOTELS = data.hotels;
    statuses = data.statuses || [];
    updatePriceBounds();
  } catch (error) {
    if (id !== requestId) return;
    searchError = error.message;
  } finally {
    if (id === requestId) { isLoading = false; render(); }
  }
});

checkinInput.addEventListener('change', updateCheckoutMin);
guestsSelect.addEventListener('change', () => {
  state.adults = currentQuery().adults;
  render();
});

cityInput.addEventListener('input', () => {
  state.city = cityInput.value.trim().toLowerCase();
  render();
});

priceRange.addEventListener('input', () => {
  userTouchedPrice = true;
  state.maxPrice = Number(priceRange.value);
  state.priceLimited = state.maxPrice < MAX_PRICE;
  updatePriceLabel();
  render();
});

document.querySelectorAll('[data-stars]').forEach((cb) => {
  cb.addEventListener('change', () => {
    const s = Number(cb.dataset.stars);
    cb.checked ? state.stars.add(s) : state.stars.delete(s);
    render();
  });
});

document.querySelectorAll('[data-amenity]').forEach((cb) => {
  cb.addEventListener('change', () => {
    const a = cb.dataset.amenity;
    cb.checked ? state.amenities.add(a) : state.amenities.delete(a);
    render();
  });
});

document.querySelectorAll('[data-type]').forEach((cb) => {
  cb.addEventListener('change', () => {
    const t = cb.dataset.type;
    cb.checked ? state.types.add(t) : state.types.delete(t);
    render();
  });
});

document.querySelectorAll('[data-source]').forEach((cb) => {
  cb.addEventListener('change', () => {
    const source = cb.dataset.source;
    cb.checked ? state.sources.add(source) : state.sources.delete(source);
    render();
  });
});

document.querySelectorAll('.pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.pill').forEach((p) => p.classList.remove('is-active'));
    pill.classList.add('is-active');
    state.rating = Number(pill.dataset.rating);
    render();
  });
});

sortSelect.addEventListener('change', () => {
  state.sort = sortSelect.value;
  render();
});

hotelsEl.addEventListener('click', (e) => {
  const favBtn = e.target.closest('[data-fav]');
  if (favBtn) {
    const id = favBtn.dataset.fav;
    state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
    render();
    return;
  }

  const bookBtn = e.target.closest('[data-book]');
  if (bookBtn) {
    const hotel = HOTELS.find((h) => h.id === bookBtn.dataset.book);
    if (!hotel) return;
    const url = bookingUrl(hotel, currentQuery());
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }
});

resetBtn.addEventListener('click', resetFilters);
emptyResetBtn.addEventListener('click', resetFilters);

(async function init() {
  const id = ++requestId;
  initDates();
  isLoading = true;
  render();

  try {
    const data = await loadHotels();
    if (id !== requestId) return;
    HOTELS = data.hotels;
    statuses = data.statuses || [];
    isLoading = false;
    updatePriceBounds();
    render();
  } catch (err) {
    if (id !== requestId) return;
    isLoading = false;
    console.error(err);
    loadingEl.classList.remove('is-visible');
    hotelsEl.innerHTML = `
      <div class="empty is-visible">
        <div class="empty__icon">⚠️</div>
        <h3>Не удалось загрузить отели</h3>
        <p>Не удалось открыть подборку. Откройте Dingo по адресу http://127.0.0.1:3010.</p>
      </div>`;
    countEl.textContent = '';
  }
})();
hotelsEl.addEventListener('toggle', async (event) => {
  const details = event.target;
  if (!details.matches('details[data-rooms]') || !details.open || details.dataset.loaded) return;
  details.dataset.loaded = 'true';
  const content = details.querySelector('div');
  try {
    let data = roomCache.get(details.dataset.rooms);
    if (!data) {
      data = await api.request('rooms', { id: details.dataset.rooms });
      if (!Array.isArray(data.rooms)) throw new Error('Номера доступны на странице объекта у источника.');
      roomCache.set(details.dataset.rooms, data);
    }
    content.innerHTML = data.rooms.length
      ? '<ul>' + data.rooms.map(room => '<li>' + esc(room.name) + (room.area ? ' · ' + esc(room.area) + ' м²' : '') + '</li>').join('') + '</ul><p>Наличие и цены номеров — на сайте источника.</p>'
      : 'Источник не опубликовал типы номеров. Уточните их на странице объекта.';
  } catch (error) {
    const hotel = HOTELS.find(h => h.id === details.dataset.rooms);
    const url = hotel ? bookingUrl(hotel, currentQuery()) : '';
    content.innerHTML = '<p>Не удалось загрузить номера. Посмотрите доступные варианты на сайте источника.</p>' + (url ? '<a class="link-btn" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Открыть номера у источника ↗</a>' : '');
    delete details.dataset.loaded;
  }
}, true);
