const express = require('express');

const { exportCsv } = require('../controllers/exportController');

const router = express.Router();

router.get('/csv', exportCsv);

module.exports = router;