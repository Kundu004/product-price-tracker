const { runScrapeForAllTrackedProducts } = require('../scraper/runScrape');

/**
 * POST /api/scrape/run
 * Triggered by the external cron job every 2 hours. Also safe to call
 * manually (with the same secret) for debugging/demo purposes.
 */
async function triggerScrape(req, res) {
  try {
    const results = await runScrapeForAllTrackedProducts();
    res.json({ ranAt: new Date().toISOString(), results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { triggerScrape };
