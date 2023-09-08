const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const busPool = require('../config/busDB.js');

dotenv.config();

const secretKey = process.env.SECRETKEY;


// Check temporary booked seat
const checkTempBookedSeat = async (req, res) => {
    console.log('checkTempBookedSeat called from bus-service');
    console.log('req.body: ', req.body);

    try {
        const checkStatusQuery = {
            text: `SELECT booked_status, bus_schedule_seat_id, booking_time 
                FROM bus_schedule_seat_info 
                WHERE booked_status = 1 `,
            values: []
        }
        const checkStatusResult = await busPool.query(checkStatusQuery);
        const checkStatus = checkStatusResult.rows;
        console.log('checkStatus: ', checkStatus);
        if (checkStatus.length === 0) {
            return res.status(200).json([]);
        } else {
            // Check if the booking time is more than 15 minutes
            const currentTime = new Date().getTime();
            const fifteenMinutes = 15 * 60 * 1000;
            let expiredSeatId = [];
            for (let i = 0; i < checkStatus.length; i++) {
                const bookingTime = checkStatus[i].booking_time;
                if (currentTime - bookingTime >= fifteenMinutes) {
                    expiredSeatId.push(checkStatus[i].bus_schedule_seat_id);
                }
            }
            console.log('expiredSeatId: ', expiredSeatId);
            if (expiredSeatId.length > 0) {
                // Update status to 0
                const updateStatusQuery = {
                    text: `UPDATE bus_schedule_seat_info
                        SET booked_status = 0 
                        WHERE bus_schedule_seat_id = ANY($1)`,
                    values: [expiredSeatId]
                }
                await busPool.query(updateStatusQuery);
                console.log(` ${expiredSeatId.length} seats Status updated to 0`);
            } 
            return res.status(200).json(checkStatus);
        }
    } catch (error) {
        console.log('error: ', error);
        return res.status(500).json(error);
    }
}

module.exports = {
    checkTempBookedSeat
}