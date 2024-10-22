const express = require('express');
const multer = require('multer');
const router = express.Router();
const uploadImageCont = require('../controllers/uploadImageController');

const upload = multer();

router.post('/upload', async (req, res) => {
    try {
        if (!req.body?.imageBase64) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        const response = await uploadImageCont(req?.body);

        res.status(200).json(response);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while uploading the file.' });
    }
});

module.exports = router;
