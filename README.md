To include the uploaded image in your `README.md` file, use the following format, adjusting the image path accordingly:

```markdown
# magic-scan

This repository is for scanning pictures and finding matching images in the database.

## Technologies Used

- Node.js
- AWS Lambda
- S3 Bucket

## Installation

To install the required dependencies, run:

```bash
npm install
```

## Running the Project

To run the project, use the following command:

```bash
node index.js filePath="uploads/Grade 9/Economics IX/cccc4b52-16c1-4ca6-9268-2920e5824925.pdf"
```

### File Path from S3 Bucket

Ensure the file path from the S3 bucket is:

```
uploads/Grade 9/Economics IX/cccc4b52-16c1-4ca6-9268-2920e5824925.pdf
```

## Architecture

Below is the high-level architecture of the Magic Page Scan project:

![Architecture](./magic-scan-poc-v2%201.png)

``` 

This assumes the file is in the same directory as the README. If it's stored elsewhere, adjust the relative path accordingly.