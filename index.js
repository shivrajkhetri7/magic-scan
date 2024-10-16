'use strict';

require('dotenv').config();
const { main } = require('./src/batch/processing'); // Update the path as needed
const { connectDB, closeDB } = require('./config/dbConfig'); // Import MongoDB configuration

const handler = async (event) => {
    console.log("Event received: ", event);

    if (!event) {
        return {
            status: 'failed',
            message: 'event not found'
        };
    }

    const filePath = event.split('=')[1]; // Now, event is the file path
    console.log('filePath:', filePath);
    if (!filePath) {
        return {
            status: 'failed',
            message: 'filePath not found'
        };
    }

    try {
        // Connect to the MongoDB database
        const db = await connectDB();

        // Call the main function and pass the db instance and filePath
        const result = await main(db, filePath);

        // Close the MongoDB connection after processing
        await closeDB();

        return result;
    } catch (error) {
        console.log({ error: error });
        return { status: 'failed', message: error.message };
    }
};

// Call the handler with the filePath passed via command-line arguments
module.exports = handler(process.argv[2]);
