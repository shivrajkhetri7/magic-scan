import React, { useState, useRef } from 'react';
import { Button, Box, Typography, Container, Alert, CardMedia, Grid, LinearProgress, Card, CardContent, Link } from '@mui/material';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import axios from 'axios';

const App: React.FC = () => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [enableCapture, setEnableCapture] = useState<boolean>(false);
  const [uploadedContent, setUploadedContent] = useState<any[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const enableCamera = async () => {
    setErrorMessage(null);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setEnableCapture(true);
        }
      } else {
        setErrorMessage('Your device does not support camera access.');
        setEnableCapture(false);
      }
    } catch (error) {
      setEnableCapture(false);
      setErrorMessage('Error accessing the camera. Make sure the camera is connected and working.');
    }
  };

  const captureImage = async () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0, videoRef.current.videoWidth, videoRef.current.videoHeight);
        const dataUrl = canvasRef.current.toDataURL('image/png');
        setImageSrc(dataUrl);
        
        // Immediately upload the captured image
        await uploadImage(dataUrl);
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const tracks = stream.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setEnableCapture(false);
  };

  const uploadImage = async (image: string) => {
    if (image) {
      try {
        setUploadProgress(0); // Reset progress
        const fileName = "abc.png"; // You can change this to any desired file name.

        const response = await axios.post(
          'http://localhost:8000/magic-scan/upload',
          {
            fileName: fileName,
            imageBase64: image.split(',')[1], // Remove the "data:image/png;base64," part
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
            onUploadProgress: (progressEvent) => {
              if (progressEvent.total) { // Check if total is defined
                const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                setUploadProgress(progress);
              }
            },
          }
        );

        // Handle the response and stop the camera
        if (response.data && response.data.contentDetails) {
          setUploadedContent(response.data.contentDetails);
        }
        stopCamera();
        setUploadProgress(null); // Hide progress bar after completion
      } catch (error) {
        console.error('Error uploading the image:', error);
        setUploadProgress(null);
      }
    }
  };

  return (
    <Container>
      <Box textAlign="center" sx={{ my: 4 }}>
        <Typography variant="h4" gutterBottom>
          Camera Capture and Upload
        </Typography>

        {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

        <Box sx={{ my: 2 }}>
          <Button
            variant="contained"
            color="primary"
            onClick={enableCamera}
            sx={{ mr: 2 }}
            disabled={enableCapture}
          >
            Enable Camera
          </Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={captureImage}
            disabled={!enableCapture}
            sx={{ mr: 2 }}
          >
            Capture Image
          </Button>
        </Box>

        {uploadProgress !== null && (
          <Box sx={{ my: 2 }}>
            <Typography variant="body1">Uploading: {uploadProgress}%</Typography>
            <LinearProgress variant="determinate" value={uploadProgress} />
          </Box>
        )}

        <Box sx={{ my: 3 }}>
          <video ref={videoRef} width="400" height="300" autoPlay style={{ border: '1px solid #ccc' }}></video>
        </Box>

        {imageSrc && (
          <Box>
            <Typography variant="h6">Captured Image:</Typography>
            <img src={imageSrc} alt="Captured" width="200" style={{ border: '1px solid #ccc', margin: '10px 0' }} />
          </Box>
        )}

        <canvas ref={canvasRef} style={{ display: 'none' }} width="400" height="300"></canvas>

        {uploadedContent.length > 0 && (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h5">Uploaded Content</Typography>
            <Grid container spacing={2}>
              {uploadedContent.map((content) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={content.ContentID}>
                  <Card sx={{ height: 300, width: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <InsertDriveFileIcon sx={{ fontSize: 100, color: 'action.active', cursor: 'pointer' }} onClick={() => window.open(content.s3Url, '_blank')} />
                    <CardContent sx={{ flexGrow: 1, textAlign: 'center' }}>
                      <Typography variant="h6" onClick={() => window.open(content.s3Url, '_blank')} sx={{ cursor: 'pointer' }}>
                        {content.Title}
                      </Typography>
                      <Link href={content.s3Url} target="_blank" rel="noopener">
                        Open File
                      </Link>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}
      </Box>
    </Container>
  );
};

export default App;
