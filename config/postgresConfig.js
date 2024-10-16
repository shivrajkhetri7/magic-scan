const { Client } = require('pg');

// PostgreSQL connection setup
const client = new Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
});

client.connect()
    .then(() => console.log('PostgreSQL connected successfully'))
    .catch(err => console.error('PostgreSQL connection error', err.stack));

module.exports = client;
