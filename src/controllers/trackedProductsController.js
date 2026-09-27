const supabase = require('../config/supabaseClient');

/**
 * POST /api/tracked-products
 * Body: { storeProductId, productName, selectedOption, optionLabel }
 */
async function createTrackedProduct(req, res) {
  const { storeProductId, productName, selectedOption, optionLabel } = req.body;

  // Basic validation — every field here is required to have a meaningful
  // tracked product; there's no reasonable default for any of them.
  if (!storeProductId || !productName || !selectedOption) {
    return res.status(400).json({
      error: 'storeProductId, productName, and selectedOption are required.',
    });
  }

  const { data, error } = await supabase
    .from('tracked_products')
    .insert({
      store_product_id: String(storeProductId),
      product_name: productName,
      selected_option: selectedOption,
      option_label: optionLabel || null,
    })
    .select()
    .single();

  if (error) {
    // Postgres unique_violation code — this product+option combo is already tracked.
    if (error.code === '23505') {
      return res.status(409).json({
        error: 'This product and option is already being tracked.',
      });
    }
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json(data);
}

/**
 * GET /api/tracked-products
 * Returns only active (currently tracked) products by default.
 */
async function listTrackedProducts(req, res) {
  const { data, error } = await supabase
    .from('tracked_products')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
}

/**
 * DELETE /api/tracked-products/:id
 * Soft delete — sets is_active = false. Scrape history is preserved
 * (see Phase 2 design note: hard delete would cascade and destroy real
 * accumulated history, which we don't want).
 */
async function untrackProduct(req, res) {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('tracked_products')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (!data) {
    return res.status(404).json({ error: 'Tracked product not found.' });
  }

  res.json(data);
}

module.exports = {
  createTrackedProduct,
  listTrackedProducts,
  untrackProduct,
};
