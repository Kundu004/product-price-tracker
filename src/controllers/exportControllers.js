const supabase = require('../config/supabaseClient');

const CSV_HEADERS = [
  'store_product_id',
  'product_name',
  'option',
  'timestamp_utc',
  'price',
  'stock',
  'outcome',
];

function escapeCsvField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(fields) {
  return fields.map(escapeCsvField).join(',');
}

/**
 * GET /api/export/csv
 * One row per scrape attempt, across every tracked product (active and
 * untracked), oldest first. Failed attempts get empty price/stock fields.
 */
async function exportCsv(req, res) {
  const { data, error } = await supabase
    .from('scrape_attempts')
    .select(
      `attempted_at, outcome, price, stock,
       tracked_products ( store_product_id, product_name, selected_option, option_label )`
    )
    .order('attempted_at', { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const rows = [toCsvRow(CSV_HEADERS)];

  for (const attempt of data) {
    const product = attempt.tracked_products || {};
    rows.push(
      toCsvRow([
        product.store_product_id ?? '',
        product.product_name ?? '',
        product.option_label || product.selected_option || '',
        new Date(attempt.attempted_at).toISOString(),
        attempt.outcome === 'failed' ? '' : attempt.price ?? '',
        attempt.outcome === 'failed' ? '' : attempt.stock ?? '',
        attempt.outcome,
      ])
    );
  }

  const csv = rows.join('\r\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="price-tracker-export-${new Date().toISOString().slice(0, 10)}.csv"`
  );
  res.send(csv);
}

module.exports = { exportCsv };