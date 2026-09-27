const { searchProducts, fetchItem } = require('../services/storeClient');

/**
 * GET /api/products/search?q=iphone
 */
async function search(req, res) {
  const { q } = req.query;

  if (!q || !q.trim()) {
    return res.status(400).json({ error: 'Query parameter "q" is required.' });
  }

  try {
    const results = await searchProducts(q);
    res.json(results);
  } catch (err) {
    console.error('Product search failed:', err.message);
    res.status(502).json({ error: 'Failed to search the store. Please try again.' });
  }
}

/**
 * GET /api/products/:id
 * Returns full item detail, including available options, so the frontend
 * can present the option picker before tracking.
 */
async function getItem(req, res) {
  const { id } = req.params;

  try {
    const item = await fetchItem(id);
    res.json(item);
  } catch (err) {
    console.error(`Fetching item ${id} failed:`, err.message);
    res.status(502).json({ error: 'Failed to fetch item detail from the store.' });
  }
}

module.exports = { search, getItem };
