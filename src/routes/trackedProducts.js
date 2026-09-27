const express = require('express');

const {
  createTrackedProduct,
  listTrackedProducts,
  untrackProduct,
} = require('../controllers/trackedProductsController');

const router = express.Router();

router.post('/', createTrackedProduct);
router.get('/', listTrackedProducts);
router.delete('/:id', untrackProduct);

module.exports = router;
