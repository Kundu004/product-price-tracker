const express = require('express');

const {
  createTrackedProduct,
  listTrackedProducts,
  untrackProduct,
  getTrackedProductHistory,
  getTrackedProductLogs,
} = require('../controllers/trackedProductsController');

const router = express.Router();

router.post('/', createTrackedProduct);
router.get('/', listTrackedProducts);
router.delete('/:id', untrackProduct);
router.get('/:id/history', getTrackedProductHistory);
router.get('/:id/logs', getTrackedProductLogs);

module.exports = router;