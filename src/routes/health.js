const express = require('express');

const supabase = require('../config/supabaseClient');

const router = express.Router();

router.get('/', async (req, res) => {
  // A cheap query against a real table confirms the Supabase URL/key are
  // correct and the schema exists — not just that Express itself is up.
  const { error } = await supabase
    .from('tracked_products')
    .select('id', { count: 'exact', head: true });

  if (error) {
    return res.status(500).json({
      status: 'error',
      db: 'unreachable',
      message: error.message,
    });
  }

  res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
});

module.exports = router;
