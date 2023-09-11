const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const busPool = require('../config/busDB.js');
const nodemailer = require('nodemailer');

dotenv.config();

const secretKey = process.env.SECRETKEY;

const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'triptix.sfz@gmail.com',
        pass: 'geviigtztnzsfnbm', // Use an "App Password" if you have 2-Step Verification enabled
    },
});


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
            const fifteenMinutes = 3 * 60 * 1000;
            let expiredSeatId = [];
            let expiredBusSeatId = [];
            for (let i = 0; i < checkStatus.length; i++) {
                const bookingTime = checkStatus[i].booking_time;
                if (currentTime - bookingTime >= fifteenMinutes) {
                    expiredSeatId.push(checkStatus[i].bus_schedule_seat_id);
                    expiredBusSeatId.push(checkStatus[i].bus_seat_id);
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

                // Get the first user in queue
                const getFirstUserQuery = {
                    text: `SELECT *
                        FROM ticket_queue 
                        WHERE bus_seat_id = ANY($1) 
                        ORDER BY date ASC`,
                    values: [expiredBusSeatId]
                }
                const getFirstUserResult = await busPool.query(getFirstUserQuery);
                const firstUser = getFirstUserResult.rows[0];
                // Insert into ticket_info
                const insertTicketInfoQuery = {
                    text: `INSERT INTO ticket_info (ticket_id, user_id, total_fare, bus_schedule_id, number_of_tickets, passenger_info, date, source, destination)
                        VALUES ($1, $2, $3, $4, $5, $6) RETURNING ticket_id`,
                    values: [firstUser.queue_ticket_id, firstUser.user_id, firstUser.total_fare, firstUser.bus_schedule_id, firstUser.number_of_tickets, firstUser.passenger_info, firstUser.date, firstUser.source, firstUser.destination]
                }
                const insertTicketInfoResult = await busPool.query(insertTicketInfoQuery);
                const ticketId = insertTicketInfoResult.rows[0].ticket_id;

                // Remove from ticket_queue
                const removeFromTicketQueueQuery = {
                    text: `DELETE FROM ticket_queue
                        WHERE queue_ticket_id = $1`,
                    values: [firstUser.queue_ticket_id]
                }
                await busPool.query(removeFromTicketQueueQuery);

                // Send ticket to user email
                const mailOptions = {
                    from: 'triptix.sfz@gmail.com',
                    to: firstUser.email,
                    subject: `${ticketId} Ticket`,
                    text: 'Your ticket is free! Go to dashboard to proceed to payment',
                };
                await transporter.sendMail(mailOptions);
                console.log('Ticket sent to user email');


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