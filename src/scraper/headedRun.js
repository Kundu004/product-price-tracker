require('dotenv').config();

const supabase = require('../config/supabaseClient');
const { scrapePrice } = require('./priceScraper');

async function main() {
  const { data: trackedProducts, error } = await supabase
    .from('tracked_products')
    .select('*')
    .eq('is_active', true)
    .limit(1);

  if (error) throw error;

  if (!trackedProducts.length) {
    console.log('No tracked products found. Track one first via POST /api/tracked-products.');
    return;
  }

  const product = trackedProducts[0];
  console.log(
    `Running headed scrape for "${product.product_name}" (${product.option_label})...`
  );

  const result = await scrapePrice({
    storeProductId: product.store_product_id,
    optionLabel: product.option_label || product.selected_option,
    headed: true,
  });

  console.log('Result:', result);
}

main().catch((err) => {
  console.error('Headed scrape failed:', err);
  process.exit(1);
});
