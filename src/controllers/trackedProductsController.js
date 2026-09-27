const supabase = require('../config/supabaseClient');

/**
 * POST /api/tracked-products
 * Body: { storeProductId, productName, selectedOption, optionLabel }
 */
async function createTrackedProduct(req, res) {
  const { storeProductId, productName, selectedOption, optionLabel } = req.body;

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
    if (error.code === '23505') {
      // The unique constraint on (store_product_id, selected_option) isn't
      // scoped to is_active — untracking is a soft delete, so the old row
      // still exists and blocks a fresh insert. If that row is inactive,
      // this is really a "re-track" request: reactivate it instead of
      // failing, so history in scrape_attempts stays linked to the same
      // tracked_product_id rather than needing a new row (which the
      // unique constraint would block anyway).
      const { data: existing, error: fetchError } = await supabase
        .from('tracked_products')
        .select('id, is_active')
        .eq('store_product_id', String(storeProductId))
        .eq('selected_option', selectedOption)
        .single();

      if (fetchError) {
        return res.status(500).json({ error: fetchError.message });
      }

      if (existing.is_active) {
        return res.status(409).json({
          error: 'This product and option is already being tracked.',
        });
      }

      const { data: reactivated, error: reactivateError } = await supabase
        .from('tracked_products')
        .update({
          is_active: true,
          product_name: productName,
          option_label: optionLabel || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (reactivateError) {
        return res.status(500).json({ error: reactivateError.message });
      }

      return res.status(200).json(reactivated);
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
 * Soft delete — sets is_active = false. Scrape history is preserved.
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

/**
 * GET /api/tracked-products/:id/history
 * Price/stock history for one product — successful and retried scrapes
 * only (a 'failed' attempt never captured a real price/stock reading,
 * so it has nothing meaningful to plot on a history chart). Full attempt
 * log including failures is at GET /:id/logs instead.
 */
async function getTrackedProductHistory(req, res) {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('scrape_attempts')
    .select('attempted_at, price, stock, outcome, retry_count')
    .eq('tracked_product_id', id)
    .neq('outcome', 'failed')
    .order('attempted_at', { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
}

/**
 * GET /api/tracked-products/:id/logs
 * Full scrape attempt log for one product — every attempt regardless of
 * outcome, including failures with their error_reason. This is the
 * transparency/reliability view the assignment specifically asks for.
 */
async function getTrackedProductLogs(req, res) {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('scrape_attempts')
    .select('id, attempted_at, outcome, retry_count, price, stock, error_reason')
    .eq('tracked_product_id', id)
    .order('attempted_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
}

module.exports = {
  createTrackedProduct,
  listTrackedProducts,
  untrackProduct,
  getTrackedProductHistory,
  getTrackedProductLogs,
};