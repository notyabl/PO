export const API_UNAVAILABLE = 'Сервис обновления недоступен. Откройте Dingo по адресу http://127.0.0.1:3010.';
const localNames = new Set(['localhost', '127.0.0.1', '[::1]']);

export async function readJsonResponse(response, fallback = 'Не удалось получить данные. Попробуйте позже.') {
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(fallback);
  let data;
  try { data = await response.json(); } catch { throw new Error(fallback); }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : fallback);
  return data;
}

export function createApiClient({ fetchImpl = fetch, location = globalThis.location } = {}) {
  let discovered;
  async function discover() {
    const candidates = [new URL('./api/', location.href).href];
    if (localNames.has(location.hostname) && location.origin !== 'http://127.0.0.1:3010') candidates.push('http://127.0.0.1:3010/api/');
    for (const base of candidates) {
      try {
        const response = await fetchImpl(base + 'health', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
        const data = await readJsonResponse(response, API_UNAVAILABLE);
        if (data.service === 'dingo') return base;
      } catch { /* A static preview may return an HTML error page. */ }
    }
    return null;
  }
  return {
    async request(route, params = {}) {
      discovered ||= discover();
      const base = await discovered;
      if (!base) { discovered = null; throw new Error(API_UNAVAILABLE); }
      let response;
      try { response = await fetchImpl(base + route + '?' + new URLSearchParams(params), { cache: 'no-store', signal: AbortSignal.timeout(25000) }); }
      catch { discovered = null; throw new Error(API_UNAVAILABLE); }
      return readJsonResponse(response, API_UNAVAILABLE);
    },
  };
}
