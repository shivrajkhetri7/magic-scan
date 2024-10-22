const { s3Client, config } = require('../../config/awsConfig');
const client = require('../../config/postgresConfig');
const sharp = require('sharp');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const pdfPageCounter = require('pdf-page-counter');
const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

// Function to generate images from PDF pages
async function generatePage(pdfFilePath, outputDir, numPages) {
    try {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const gsCommand = `gswin64c.exe -sDEVICE=jpeg -dNOPAUSE -dBATCH -dSAFER -dFirstPage=1 -dLastPage=${numPages} -sOutputFile=${outputDir}/page-%d.jpg ${pdfFilePath}`;
        console.log("gsCommand", gsCommand)
        execSync(gsCommand);

        // Collect paths of generated images
        const generatedImages = fs.readdirSync(outputDir)
            .filter(file => file.endsWith('.jpg'))
            .map(file => path.join(outputDir, file));

        return generatedImages;
    } catch (error) {
        console.error('Error generating images:', error);
        throw new Error('Failed to generate images from PDF');
    }
}

// Function to upload each image to S3
async function uploadPage(imagePath, s3Key, directory) {
    try {
        const fileStream = fs.createReadStream(imagePath);

        // Construct the S3 Key with the specified directory
        const params = {
            Bucket: config.bucketName,
            Key: `${directory}/${s3Key}`,  // Use the directory in the Key
            Body: fileStream,
            ContentType: 'image/jpeg',
        };

        await s3Client.send(new PutObjectCommand(params));
        console.log(`Uploaded ${imagePath} to S3 as ${directory}/${s3Key}`);
    } catch (error) {
        console.error('Error uploading image to S3:', error);
        throw new Error('Failed to upload image to S3');
    }
}

async function generateVector(imagePath) {
    try {
        // Create a FormData object to send the image file
        const formData = new FormData();
        formData.append('imageFile', fs.createReadStream(imagePath));

        // Send the image data to the vector API
        const response = await axios.post(process.env.VECTOR_API_URL, formData, {
            headers: {
                'apikey': process.env.VECTOR_API_KEY,
                'apisecret': process.env.VECTOR_API_SECRET,
                ...formData.getHeaders(), // Include headers for form data
            },
        });
        console.log('response', response)
        // Assuming the response contains the vector data
        return response.data; // Adjust this based on the actual response structure
    } catch (error) {
        console.error('Error generating vector:', error);
        throw new Error('Failed to generate vector from image');
    }
}


async function storeVector(client, vectorData) {
    const query = `
        INSERT INTO "eSense"."ContentPageVector" 
        ("ContentId", "PageNumber", "Status", "CreatedAt", "PageVector", "UpdatedAt","PageImage")
        VALUES ($1, $2, $3, $4, $5, $6, $7);
    `;

    const values = [
        vectorData.contentId,
        vectorData.page,            // PageNumber
        vectorData.status,
        vectorData.createdAt,       // Ensure this is a valid date format
        JSON.stringify(vectorData.pageVector), // Convert to string
        new Date(),
        vectorData?.pageImage
    ];

    // Log the input values for debugging
    console.log('Input Values:', values);
    try {
        await client.query(query, values);
        console.log('Vector data stored in database');
    } catch (error) {
        console.error('Error storing vector data:', error);
        throw new Error('Failed to store vector data in database');
    }
}



async function getContentByFilePath(filePath) {
    const query = `
        SELECT *
        FROM "eSense"."Content"
        WHERE "FileName" = $1
        ORDER BY "ContentID" ASC;
    `;

    try {
        const res = await client.query(query, [filePath]);
        return res.rows;
    } catch (error) {
        console.error('Error executing query', error);
        throw new Error('Failed to retrieve content from PostgreSQL');
    }
}

// Main function to handle the entire process
async function main(db, filePath) {
    try {
        console.log('Processing PDF file for file path:', filePath);
        const directory = 'mySpecificDirectory';

        // The S3 object parameters
        const s3Object = {
            Bucket: config.bucketName,
            Key: filePath,
        };

        const command = new GetObjectCommand(s3Object);
        const s3File = await s3Client.send(command);

        const contentDetails = await getContentByFilePath(filePath);
        console.log('contentDetails', contentDetails)
        if (!contentDetails || contentDetails.length === 0) {
            return { status: 'failed', message: 'File not found in PostgreSQL' };
        }
        const contentId = contentDetails[0]?.ContentID;
        const createdAt = new Date();
        const fileName = path.basename(filePath);
        const fileToSave = path.join('/tmp', fileName);
        const imagesToSave = path.join('/tmp', 'book-pdf-file', fileName);

        if (!fs.existsSync(imagesToSave)) {
            fs.mkdirSync(imagesToSave, { recursive: true });
        }

        // Download PDF file from S3
        const downloadResult = await new Promise((resolve, reject) => {
            s3File.Body.pipe(fs.createWriteStream(fileToSave, { autoClose: true }))
                .on('error', (err) => reject(err))
                .on('close', () => resolve({ status: true, message: 's3 object downloaded' }));
        });

        if (!downloadResult.status) {
            return {
                status: 'failed',
                message: 's3 object process failed',
                s3Object,
            };
        }

        // Get number of pages in PDF
        const pdfData = await pdfPageCounter(fs.readFileSync(fileToSave));
        const numPages = pdfData.numpages;

        // Generate images for each page
        const generatedImages = await generatePage(fileToSave, imagesToSave, numPages);

        // Process each image: generate vectors and upload to S3
        for (let i = 0; i < generatedImages.length; i++) {
            const imagePath = generatedImages[i];
            const imageS3Key = `book_pages_${fileName}_${String(i + 1).padStart(3, '0')}.jpg`;

            // Generate vector data by calling the Python API (passing the local image)
            const vectorData = await generateVector(imagePath);
            // Store the vector data in the database
            await storeVector(client, {
                contentId: contentId,
                pageVector: vectorData?.vector,
                page: i + 1,                 // Assuming this corresponds to PageNumber
                status: 1,
                createdAt: createdAt,        // Ensure this is a valid date
                updatedAt: new Date(),  // Set UpdatedAt to current timestamp
                pageImage: imageS3Key
            });

            // Upload image to S3 after generating vector
            console.log(imagePath, imageS3Key, "stored")
            await uploadPage(imagePath, imageS3Key, directory);
        }

        // Clean up local files
        fs.unlinkSync(fileToSave);
        fs.rmSync(imagesToSave, { recursive: true });
        console.log('PDF processing completed successfully.');
        return { status: 'success' };
    } catch (error) {
        console.error('Error in PDF processing:', error);
        return { status: 'failed', message: error.message };
    }
}

module.exports = {
    generatePage,
    uploadPage,
    generateVector,
    storeVector,
    main,
};
