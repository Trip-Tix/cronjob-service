const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const busPool = require('../config/busDB.js');
const nodemailer = require('nodemailer');
const accountPool = require('../config/accountDB');

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
            text: `SELECT booked_status, bus_schedule_seat_id, booking_time, bus_seat_id  
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
                    expiredBusSeatId.push(parseInt(checkStatus[i].bus_seat_id));
                }
            }
            console.log('expiredSeatId: ', expiredSeatId);
            if (expiredSeatId.length > 0) {
                // Update status to 0
                const updateStatusQuery = {
                    text: `UPDATE bus_schedule_seat_info
                        SET booked_status = 0 
                        WHERE bus_schedule_seat_id = ANY($1::bigint[]) RETURNING *`,
                    values: [expiredSeatId]
                }
                const result = await busPool.query(updateStatusQuery);
                console.log(result.rows);
                const ticketIds = result.rows.map((item) => item.ticket_id);

                console.log(` ${expiredSeatId.length} seats Status updated to 0`);

                // remove all ticket id from ticket_info
                const removeTicketInfoQuery = {
                    text: `DELETE FROM ticket_info
                        WHERE ticket_id = ANY($1::bigint[])`,
                    values: [ticketIds]
                }
                await busPool.query(removeTicketInfoQuery);
                console.log(` ${ticketIds.length} ticket info removed`);

                console.log(expiredBusSeatId);
                // Get the first user in queue

                let firstUser = {};

                for (let i = 0; i < expiredBusSeatId.length; i++) {
                    a = expiredBusSeatId[i];
                    const getFirstUserQuery = {
                        text: `SELECT *
                            FROM ticket_queue
                            WHERE $1 = ANY(bus_seat_id)
                            ORDER BY date ASC`,
                        values: [a]
                    }
                    const getFirstUserResult = await busPool.query(getFirstUserQuery);
                    const f = getFirstUserResult.rows[0];
                    if (f.length !== 0) {
                        firstUser = f;
                        break;
                    }
                }
                
                console.log('firstUser: ', firstUser);
                // Insert into ticket_info
                const insertTicketInfoQuery = {
                    text: `INSERT INTO ticket_info (ticket_id, user_id, total_fare, bus_schedule_id, number_of_tickets, passenger_info, date, source, destination)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ticket_id`,
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

                const userid = firstUser.user_id;

                // Get user email
                const getUserEmailQuery = {
                    text: `SELECT email
                        FROM user_info
                        WHERE user_id = $1`,
                    values: [userid]
                }
                const getUserEmailResult = await accountPool.query(getUserEmailQuery);
                const userEmail = getUserEmailResult.rows[0].email;

                // Send ticket to user email
                const mailOptions = {
                    from: 'triptix.sfz@gmail.com',
                    to: userEmail,
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