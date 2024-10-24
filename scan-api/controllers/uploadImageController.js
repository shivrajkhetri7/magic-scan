const client = require('../db/postgresConfig');
const axios = require('axios');
const FormData = require('form-data');
const { S3Client, GetObjectCommand, ListObjectsCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const config = {
    region: process.env.AWS_S3_REGION,
    bucketName: process.env.AWS_ESENSE_BUCKET,
    urlExpiration: parseInt(process.env.AWS_S3_URL_EXP_TIME_IN_SEC, 10) || 3600,
};

const s3Client = new S3Client({
    region: config.region,
    credentials: {
        accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY,
    },
});

const generateVector = async (base64Image) => {
    try {
        const formData = new FormData();
        const buffer = Buffer.from(base64Image, 'base64');
        formData.append('imageFile', buffer, { filename: 'image.jpg' });

        const response = await axios.post(process.env.VECTOR_API_URL, formData, {
            headers: {
                'apikey': process.env.VECTOR_API_KEY,
                'apisecret': process.env.VECTOR_API_SECRET,
                ...formData.getHeaders(),
            },
        });

        return response.data;
    } catch (error) {
        console.error('Error generating vector:', error);
        throw new Error('Failed to generate vector from image');
    }
};

const getVectorMatch = async (vectorToMatch) => {
    try {
        const query = `
            SELECT *
            FROM "eSense"."FN_SearchContentPageVector"($1, $2, $3);
        `;

        const formattedVector = JSON.stringify(vectorToMatch);
        const matchThreshold = parseFloat(process.env.VECTOR_THRESHOLD) || 0.3;
        const matchCount = 2;

        const res = await client.query(query, [formattedVector, matchThreshold, matchCount]);

        if (res.rows.length === 0) {
            return {
                status: 'success',
                message: 'match not found',
            };
        }

        return res.rows;
    } catch (error) {
        console.error('Error while finding the vector match:', error);
        throw new Error('Error while finding the vector match in table');
    }
};

const getImageUrl = async (s3Key) => {
    try {
        const params = {
            Bucket: config.bucketName,
            Key: s3Key
        };

        const command = new GetObjectCommand(params);
        const url = await getSignedUrl(s3Client, command, { expiresIn: config.urlExpiration });

        return url;
    } catch (error) {
        console.error('Error fetching the image from S3:', error);
        throw new Error('Failed to fetch image URL from S3');
    }
};

const fetchChapterAndTopic = async (ContentId) => {
    const query = `
        SELECT "ChapterID", "TopicID"
        FROM "eSense"."ContentMap"
        WHERE "ContentID" = $1
    `;
    const result = await client.query(query, [ContentId]); // Assuming db is your database client

    return result.rows[0]; // Assuming the result contains rows
};

const fetchContentIDs = async (ChapterID, TopicID) => {
    const query = `
        SELECT "ContentID"
        FROM "eSense"."ContentMap"
        WHERE "ChapterID" = $1 AND "TopicID" = $2
    `;
    const result = await client.query(query, [ChapterID, TopicID]);

    // Return only the ContentIDs
    return Array.from(new Set(result.rows.map(row => row.ContentID)));
};

const fetchContentDetails = async (contentIDs) => {
    if (contentIDs.length === 0) return []; // Return an empty array if no ContentIDs

    // Create a parameterized query for the ContentIDs
    const placeholders = contentIDs.map((_, index) => `$${index + 1}`).join(", ");
    const query = `
        SELECT "ContentID", "Title", "ContentName", "ContentDescription", "FilePath", "FileName", "DisplayFileName", "FileTypeID", "FileSize", "Duration", "VideoResolution", "Publisher", "Author", "Thumbnail", "StatusID", "UpdatedBy", "UpdatedOn", "ThumbnailPath", "SpriteSheetPath", "H5PID", "ThumbnailType", "IsEncrypted", "IsEncryptionRequire", "TempPath"
        FROM "eSense"."Content"
        WHERE "ContentID" IN (${placeholders})
    `;
    
    const result = await client.query(query, contentIDs); // Assuming db is your database client

    const contentDetails = await Promise.all(result.rows.map(async (row) => {
        const s3Url = row.FileName ? await getPresignedUrl(row.FileName) : null; // Fetch presigned URL

        return {
            ...row,
            s3Url // Add the presigned URL
        };
    }));

    return contentDetails; // Return all the details for the matching ContentIDs with imgUrl
};

const getPresignedUrl = async (fileName) => {
    const s3Object = {
        Bucket: config.bucketName,
        Key: fileName,
    };

    const command = new GetObjectCommand(s3Object);

    try {
        // Use the getSignedUrl function here
        const url = await getSignedUrl(s3Client, command, { expiresIn: config.urlExpiration });
        return url;
    } catch (error) {
        console.error(`Error getting presigned URL for ${fileName}:`, error);
        return null; // Return null if there's an error
    }
};

const uploadImageCont = async (params) => {
    try {
        const vectorData = await generateVector(params?.imageBase64);

        if (vectorData) {
            const vectorToMatch = vectorData?.vector || [];
            const vectorMatch = await getVectorMatch(vectorToMatch);
            console.log('vectorMatch',vectorMatch)
            // console.log('vectorToMatch',JSON.stringify(vectorToMatch))
            //TODO : for multiple resources 
            if (vectorMatch.length && vectorMatch[0]?.ContentId) {
                const ContentId = vectorMatch[0]?.ContentId;

                // Step 1: Fetch ChapterID and TopicID using ContentId
                const chapterTopicData = await fetchChapterAndTopic(ContentId);

                if (chapterTopicData) {
                    const { ChapterID, TopicID } = chapterTopicData;

                    // Step 2: Fetch all ContentIDs using ChapterID and TopicID
                    const contentIDs = await fetchContentIDs(ChapterID, TopicID);

                    // Step 3: Fetch details from Content using the list of ContentIDs
                    const contentDetails = await fetchContentDetails(contentIDs);

                    // Return or process the content IDs as needed
                    return { status: "Success", contentDetails };
                }
            }

            return { status: "Success" }
        }
    } catch (error) {
        console.error(error.message);
        throw new Error('Error while generating vector');
    }
};

module.exports = uploadImageCont;

