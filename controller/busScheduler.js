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
        // Begin transaction
        await busPool.query('BEGIN');
        const checkStatusQuery = {
            text: `SELECT booked_status, bus_schedule_seat_id, booking_time, bus_seat_id, ticket_id   
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
            let expiredId = [];
            let expiredBusSeatId = [];
            let expiredTicketId = [];
            for (let i = 0; i < checkStatus.length; i++) {
                const bookingTime = checkStatus[i].booking_time;
                console.log('bookingTime: ', bookingTime, ' currentTime: ', currentTime);
                if ((currentTime - bookingTime) >= fifteenMinutes) {
                    expiredId.push(checkStatus[i].bus_schedule_seat_id);
                    expiredBusSeatId.push(parseInt(checkStatus[i].bus_seat_id));
                    expiredTicketId.push(checkStatus[i].ticket_id);
                }
            }
            console.log('expiredId: ', expiredId);
            console.log('expiredBusSeatId: ', expiredBusSeatId);
            console.log('expiredTicketId: ', expiredTicketId);
            if (expiredId.length > 0) {
                // Update status to 0
                const updateStatusQuery = {
                    text: `UPDATE bus_schedule_seat_info
                        SET booked_status = 0, user_id = NULL, ticket_id = NULL, booking_time = NULL, passenger_id = NULL, passenger_gender = NULL  
                        WHERE bus_schedule_seat_id = ANY($1::bigint[]) RETURNING *`,
                    values: [expiredId]
                }
                const result = await busPool.query(updateStatusQuery);
                console.log(result.rows);

                console.log(` ${expiredId.length} seats Status updated to 0`);

                // remove all ticket id from ticket_info
                const removeTicketInfoQuery = {
                    text: `DELETE FROM ticket_info
                        WHERE ticket_id = ANY($1)`,
                    values: [expiredTicketId]
                }
                await busPool.query(removeTicketInfoQuery);
                console.log(` ${expiredTicketId.length} ticket info removed`);

                console.log(expiredBusSeatId);
                // Get the first user in queue

                let firstUser = {};

                for (let i = 0; i < expiredBusSeatId.length; i++) {
                    const singleSeatId = expiredBusSeatId[i];
                    const getFirstUserQuery = {
                        text: `SELECT *
                            FROM ticket_queue
                            WHERE $1 = ANY(bus_seat_id)
                            ORDER BY date ASC`,
                        values: [singleSeatId]
                    }
                    const getFirstUserResult = await busPool.query(getFirstUserQuery);
                    console.log('getFirstUserResult.rows: ', getFirstUserResult.rows);
                    if (getFirstUserResult.rows.length !== 0) {
                        firstUser = getFirstUserResult.rows[0];

                        // Update bus schedule info to set booked status to 1
                        const updateBusScheduleInfoQuery = {
                            text: `UPDATE bus_schedule_seat_info
                                SET booked_status = 1, user_id = $1, ticket_id = $2, booking_time = $3 
                                WHERE bus_schedule_id = $4 
                                AND bus_seat_id = $5`,
                            values: [firstUser.user_id, firstUser.queue_ticket_id, currentTime, firstUser.bus_schedule_id, singleSeatId]

                        }
                        await busPool.query(updateBusScheduleInfoQuery);
                        console.log(`Bus schedule info updated`);
                        break;
                    }
                }
                
                console.log('firstUser: ', firstUser);

                if (Object.keys(firstUser).length === 0) {
                    return res.status(200).json(checkStatus);
                }

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
        await busPool.query('ROLLBACK');
        console.log('error: ', error);
        return res.status(500).json(error);
    } finally {
        await busPool.query('COMMIT');
    }
}

module.exports = {
    checkTempBookedSeat
}