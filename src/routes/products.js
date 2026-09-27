const express = require('express');

const { search, getItem } = require('../controllers/productsController');

const router = express.Router();

router.get('/search', search);
router.get('/:id', getItem);

module.exports = router;
