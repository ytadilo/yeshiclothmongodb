const express = require('express');
const router = express.Router();

const { getUsdEtb } = require('../controllers/exchangeRateController');

router.get('/usd-etb', getUsdEtb);

module.exports = router;
