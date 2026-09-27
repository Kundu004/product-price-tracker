const supabase = require('../config/supabaseClient');
const { scrapePrice } = require('./priceScraper');

/**
 * Runs a scrape pass over every active tracked product, recording one row
 * per product in scrape_attempts regardless of outcome. A crash while
 * scraping one product is caught and recorded as a failed attempt for
 * that product only — it must never abort the rest of the run.
 */
async function runScrapeForAllTrackedProducts({ headed = false } = {}) {
  const { data: trackedProducts, error } = await supabase
    .from('tracked_products')
    .select('*')
    .eq('is_active', true);

  if (error) {
    throw new Error(`Failed to load tracked products: ${error.message}`);
  }

  const results = [];

  for (const product of trackedProducts) {
    try {
      const result = await scrapePrice({
        storeProductId: product.store_product_id,
        optionLabel: product.option_label || product.selected_option,
        headed,
      });

      const { error: insertError } = await supabase.from('scrape_attempts').insert({
        tracked_product_id: product.id,
        outcome: result.outcome,
        retry_count: result.retryCount,
        price: result.price,
        stock: result.stock,
        error_reason: result.errorReason,
      });

      if (insertError) {
        // The scrape itself succeeded or failed correctly — this is a
        // separate, secondary problem (DB write failed). Log it loudly
        // rather than losing it silently.
        console.error(
          `Failed to record scrape attempt for tracked product ${product.id}:`,
          insertError.message
        );
      }

      results.push({ trackedProductId: product.id, ...result });
    } catch (err) {
      // A crash in scrapePrice itself (shouldn't normally happen — it has
      // its own try/catch — but defense in depth) must not stop the loop.
      console.error(`Scrape crashed for tracked product ${product.id}:`, err.message);

      await supabase.from('scrape_attempts').insert({
        tracked_product_id: product.id,
        outcome: 'failed',
        retry_count: 0,
        price: null,
        stock: null,
        error_reason: err.message.slice(0, 200),
      });

      results.push({
        trackedProductId: product.id,
        outcome: 'failed',
        errorReason: err.message,
      });
    }
  }

  return results;
}

module.exports = { runScrapeForAllTrackedProducts };
