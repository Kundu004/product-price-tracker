/**
 * Protects POST /api/scrape/run so only the cron job (which knows the
 * shared secret) can trigger a real, costly scrape run — not anyone who
 * finds the URL.
 */
function verifyCronSecret(req, res, next) {
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  const provided = req.headers.authorization || '';

  if (!process.env.CRON_SECRET || provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

module.exports = verifyCronSecret;
