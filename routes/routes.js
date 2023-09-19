const express = require('express');
const bodyParser = require('body-parser').json();
const busSchedulerController = require('../controller/busScheduler');
const trainSchedulerController = require('../controller/trainScheduler');
const airSchedulerController = require('../controller/airScheduler');

const router = express.Router();

// Check temporary booked seat
router.post('/api/checkTempBookedSeatBus', bodyParser, busSchedulerController.checkTempBookedSeat);
router.post('/api/checkTempBookedSeatTrain', bodyParser, trainSchedulerController.checkTempBookedSeat);
router.post('/api/checkTempBookedSeatAir', bodyParser, airSchedulerController.checkTempBookedSeat);

module.exports = router;