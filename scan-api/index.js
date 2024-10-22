const express = require('express');
const dotenv = require('dotenv').config();
const bodyParser = require('body-parser');
const cors = require('cors');
const PORT = process.env.PORT || 8000;

const uploadRoutes = require('./routes/uploadRoute');

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

app.use('/magic-scan', uploadRoutes);

app.listen(PORT,()=>{
    console.log(`server running on http://localhost:${PORT}`);
})