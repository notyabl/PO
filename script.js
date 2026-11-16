const AMENITY_LABEL = {
  wifi: 'Wi-Fi', breakfast: 'Завтрак', pool: 'Бассейн',
  spa: 'Спа', parking: 'Парковка', gym: 'Фитнес',
};
const TYPE_LABEL = {
  hotel: 'Отель', apart: 'Апартаменты', villa: 'Вилла', guest: 'Гостевой дом',
};
const SOURCE_LABEL = {
  ostrovok: 'Ostrovok', sutochno: 'Суточно.ру', demo: 'Демо',
};

let HOTELS = [];
let MAX_PRICE = 30000;
let isLoading = false;
let userTouchedPrice = false;

const state = {
  city: '', maxPrice: MAX_PRICE, stars: new Set(), rating: 0,
  amenities: new Set(), types: new Set(), sort: 'popular', favorites: new Set(),
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
  const iso = (d) => d.toISOString().slice(0, 10);
  const min = iso(today);
  checkinInput.value = min;
  checkinInput.min = min;
  checkoutInput.value = iso(checkout);
  checkoutInput.min = min;
}

function buildBookingUrl(hotel) {
  if (!hotel.bookingUrl) return null;
  let url;
  try {
    url = new URL(hotel.bookingUrl);
  } catch {
    return hotel.bookingUrl;
  }

  // Ostrovok и Суточно принимают даты/гостей через query
  if (url.hostname.includes('ostrovok.ru')) {
    const adults = (guestsSelect.value.match(/\d+/) || ['2'])[0];
    url.searchParams.set('dates', `${checkinInput.value}-${checkoutInput.value}`);
    url.searchParams.set('guests', adults);
  }

  if (url.hostname.includes('sutochno.ru')) {
    url.searchParams.set('in', checkinInput.value);
    url.searchParams.set('out', checkoutInput.value);
  }

  return url.toString();
}

async function loadHotels() {
  const res = await fetch('hotels.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`hotels.json: HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('hotels.json должен быть массивом');
  return data;
}

function updatePriceBounds() {
  const maxInData = Math.max(0, ...HOTELS.map((h) => h.price || 0));
  MAX_PRICE = Math.max(1000, Math.ceil(maxInData / 1000) * 1000);
  if (!userTouchedPrice) state.maxPrice = MAX_PRICE;
  if (state.maxPrice > MAX_PRICE) state.maxPrice = MAX_PRICE;
  priceRange.max = MAX_PRICE;
  priceRange.value = state.maxPrice;
  updatePriceLabel();
}

function updatePriceLabel() {
  priceValue.textContent =
    state.maxPrice >= MAX_PRICE ? 'Любая' : `до ${money(state.maxPrice)}`;
}

function getFilteredHotels() {
  const list = HOTELS.filter((h) => {
    if (state.city && !String(h.city).toLowerCase().includes(state.city)) return false;
    if (h.price > state.maxPrice) return false;
    if (state.stars.size && !state.stars.has(h.stars)) return false;
    if (state.rating && h.rating < state.rating) return false;
    if (state.types.size && !state.types.has(h.type)) return false;
    if (state.amenities.size &&
        ![...state.amenities].every((a) => (h.amenities || []).includes(a))) return false;
    return true;
  });

  switch (state.sort) {
    case 'price-asc':  list.sort((a, b) => a.price - b.price); break;
    case 'price-desc': list.sort((a, b) => b.price - a.price); break;
    case 'rating':     list.sort((a, b) => b.rating - a.rating); break;
    default:           list.sort((a, b) => (b.sources?.length || 0) - (a.sources?.length || 0));
  }
  return list;
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
  const price = hotel.price > 0
    ? `<b>${money(hotel.price)}</b><span>за ночь</span>`
    : `<b>—</b><span>цена на сайте</span>`;

  const reviews = hotel.reviews > 0
    ? `<div class="card__reviews">${hotel.reviews} ${plural(hotel.reviews, ['отзыв', 'отзыва', 'отзывов'])}</div>`
    : '<div class="card__reviews"></div>';

  const sourceBadge = hotel.source && SOURCE_LABEL[hotel.source]
    ? `<span class="card__source">${SOURCE_LABEL[hotel.source]}</span>` : '';

  return `
    <article class="card" data-id="${hotel.id}">
      <div class="card__media">
        ${media}
        <span class="card__type">${esc(TYPE_LABEL[hotel.type] || 'Отель')}</span>
        <button class="card__fav ${isFav ? 'is-active' : ''}" type="button"
                data-fav="${hotel.id}" aria-pressed="${isFav}">${isFav ? '♥' : '♡'}</button>
      </div>
      <div class="card__body">
        <div class="card__top">
          <span class="card__stars">${stars}</span>
          ${hotel.rating > 0
            ? `<span class="card__rating ${hotel.rating >= 9 ? 'is-great' : ''}">${hotel.rating.toFixed(1)}</span>`
            : ''}
        </div>
        <h3 class="card__title">${esc(hotel.name)}</h3>
        <p class="card__city">${esc(hotel.city)}${hotel.district ? ' · ' + esc(hotel.district) : ''}</p>
        ${amenities ? `<ul class="card__amenities">${amenities}</ul>` : ''}
        <div class="card__footer">
          ${reviews}
          <div class="card__price">${price}${sourceBadge}</div>
        </div>
        <div class="card__actions">
          <button class="btn btn--primary" type="button" data-book="${hotel.id}">Забронировать</button>
        </div>
      </div>
    </article>
  `;
}

function render() {
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
  userTouchedPrice = false;

  cityInput.value = '';
  priceRange.value = MAX_PRICE;
  updatePriceLabel();

  document.querySelectorAll('[data-stars], [data-amenity], [data-type]')
    .forEach((cb) => { cb.checked = false; });

  document.querySelectorAll('.pill').forEach((pill) => {
    pill.classList.toggle('is-active', pill.dataset.rating === '0');
  });

  render();
}

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  state.city = cityInput.value.trim().toLowerCase();
  render();
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

cityInput.addEventListener('input', () => {
  state.city = cityInput.value.trim().toLowerCase();
  render();
});

priceRange.addEventListener('input', () => {
  userTouchedPrice = true;
  state.maxPrice = Number(priceRange.value);
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
    const id = Number(favBtn.dataset.fav);
    state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
    render();
    return;
  }

  const bookBtn = e.target.closest('[data-book]');
  if (bookBtn) {
    const hotel = HOTELS.find((h) => h.id === Number(bookBtn.dataset.book));
    if (!hotel) return;
    const url = buildBookingUrl(hotel);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }
});

resetBtn.addEventListener('click', resetFilters);
emptyResetBtn.addEventListener('click', resetFilters);

(async function init() {
  initDates();
  isLoading = true;
  render();

  try {
    HOTELS = await loadHotels();
    isLoading = false;
    updatePriceBounds();
    render();
  } catch (err) {
    isLoading = false;
    console.error(err);
    hotelsEl.innerHTML = `
      <div class="empty is-visible">
        <div class="empty__icon">⚠️</div>
        <h3>Не удалось загрузить отели</h3>
        <p>Проверьте, что файл <b>hotels.json</b> лежит рядом с index.html и вы открыли сайт через Live Server.</p>
      </div>`;
    countEl.textContent = '';
  }
})();