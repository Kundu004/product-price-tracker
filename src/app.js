const express = require('express');
const cors = require('cors');

const healthRoute = require('./routes/health');

const app = express();

// Only the deployed frontend origin is allowed to call this API.
// FRONTEND_URL is set as an env var per environment (local dev vs. production),
// so we never hardcode a domain or fall back to a wildcard "*" origin.
const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(
  cors({
    origin: allowedOrigin,
  })
);

app.use(express.json());

app.use('/api/health', healthRoute);

module.exports = app;
