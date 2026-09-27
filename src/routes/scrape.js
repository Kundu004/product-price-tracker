const express = require('express');

const verifyCronSecret = require('../middleware/verifyCronSecret');
const { triggerScrape } = require('../controllers/scrapeController');

const router = express.Router();

router.post('/run', verifyCronSecret, triggerScrape);

module.exports = router;
