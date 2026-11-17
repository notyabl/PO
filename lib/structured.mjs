export function structuredItems($) {
  const result = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    if ([node['@type']].flat().some(type => ['Hotel', 'LodgingBusiness', 'Apartment', 'VacationRental', 'HotelRoom'].includes(type))) result.push(node);
    for (const key of ['@graph', 'itemListElement', 'item', 'containsPlace']) visit(node[key]);
  }
  $('script[type="application/ld+json"]').each((_, element) => {
    try { visit(JSON.parse($(element).text())); } catch { /* Ignore unrelated invalid JSON-LD. */ }
  });
  return result;
}
