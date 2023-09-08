const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const airPool = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASEAIR,
    idleTimeoutMillis: 0,
    connectionTimeoutMillis: 0,
    ssl: {
        rejectUnauthorized: false
    }
});

airPool.connect(err => {
    if (err) {
        console.error('connection error', err.stack);
    } else {
        console.log('connected to train database');
    }
});

module.exports = airPool;