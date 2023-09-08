const express = require('express');
const bodyParser = require('body-parser').json();
const busSchedulerController = require('../controller/busScheduler');

const router = express.Router();

// Check temporary booked seat
router.post('/api/checkTempBookedSeat', bodyParser, busSchedulerController.checkTempBookedSeat);

module.exports = router;