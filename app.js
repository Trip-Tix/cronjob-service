const express = require('express');
const dotenv = require("dotenv")
const router = require('./routes/routes');
const cors = require('cors');

dotenv.config()

const app = express();
const port = process.env.PORT;

app.use(express.json());
app.use(cors());
app.use('/', router);

app.get('/', (req, res) => {
    res.send('Cron Job service is up and running');
});

app.listen(port, () => {
    console.log(`Cron Job service listening on port ${port}`);
});