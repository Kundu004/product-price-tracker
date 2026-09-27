const axios = require('axios');

const STORE_BASE_URL = process.env.TARGET_STORE_URL || 'https://demo.inelabteamdev.com';

// A dedicated axios instance with a sane timeout — a hanging request to the
// store should never hang our API indefinitely. 10s is generous for a plain
// JSON listing call (this is not the price/handshake path, which gets its
// own, more forgiving timeout in Phase 4).
const storeHttp = axios.create({
  baseURL: `${STORE_BASE_URL}/api/v2`,
  timeout: 10_000,
});

/**
 * Fetches one page of the store's product listing.
 * Confirmed shape: GET /api/v2/listings?page=N&limit=20
 */
async function fetchListingsPage(page = 1, limit = 20) {
  const { data } = await storeHttp.get('/listings', {
    params: { page, limit },
  });
  return data;
}

// In-memory cache of the full catalog. There's no confirmed server-side
// search param on /listings, and fetching all ~960 products across 48
// pages on every keystroke would be wasteful and slow. The catalog is
// effectively static for the duration of the assignment, so we fetch it
// once, cache it, and filter locally. A short TTL means it self-heals if
// the store's data ever changes without needing a restart.
let catalogCache = null;
let catalogFetchedAt = 0;
const CATALOG_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getFullCatalog() {
  const isFresh = catalogCache && Date.now() - catalogFetchedAt < CATALOG_TTL_MS;
  if (isFresh) return catalogCache;

  const firstPage = await fetchListingsPage(1, 100); // ask for a large page size to minimize requests
  let allResults = [...firstPage.results];
  const perPage = firstPage.results.length;
  const totalPages = Math.ceil(firstPage.count / perPage);

  for (let page = 2; page <= totalPages; page++) {
    const nextPage = await fetchListingsPage(page, perPage);
    allResults = allResults.concat(nextPage.results);
  }

  catalogCache = allResults;
  catalogFetchedAt = Date.now();
  return catalogCache;
}

/**
 * Search by partial or full product name (case-insensitive), against the
 * cached full catalog.
 */
async function searchProducts(query) {
  const catalog = await getFullCatalog();
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return catalog.filter((product) => product.name.toLowerCase().includes(q));
}

/**
 * Fetches full detail for one item, including its available options.
 * ASSUMPTION (not yet directly confirmed): the store reuses the /listings
 * resource name for single-item lookup, i.e. GET /api/v2/listings/{id}.
 * If this 404s in practice, check the Network tab for the real item
 * request's full URL and this is the one function to fix.
 */
async function fetchItem(storeProductId) {
  const { data } = await storeHttp.get(`/items/${storeProductId}`);
  return data;
}

module.exports = {
  fetchListingsPage,
  searchProducts,
  fetchItem,
};