require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI; // Define this in your .env file
const dbName = process.env.MONGODB_DBNAME; // Define this in your .env file

let client = null;

const connectDB = async () => {
    if (client && client.isConnected()) {
        return client.db(dbName);
    }
    try {
        client = await MongoClient.connect(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB');
        return client.db(dbName);
    } catch (err) {
        console.error('Error connecting to MongoDB:', err);
        throw err;
    }
};

const closeDB = async () => {
    if (client) {
        await client.close();
        console.log('MongoDB connection closed');
    }
};

module.exports = { connectDB, closeDB };
