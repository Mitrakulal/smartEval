import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';

interface ImageCaptureProps {
  imageUrl: string | null;
  isLoading: boolean;
  onUpload: (file: File) => void;
  onDelete?: () => void;
}

export function ImageCapture({
  imageUrl,
  isLoading,
  onUpload,
  onDelete,
}: ImageCaptureProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onUpload(acceptedFiles[0]);
      }
    },
    [onUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
    },
    maxFiles: 1,
    disabled: isLoading,
  });

  return (
    <Paper
      variant="outlined"
      sx={{
        height: '100%',
        minHeight: 460,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 2,
        overflow: 'hidden',
        bgcolor: 'background.paper',
      }}
    >
      <Box
        sx={{
          p: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <PhotoCameraIcon fontSize="small" color="primary" /> Answer Script Photo
        </Typography>
        {imageUrl && onDelete && (
          <Button
            size="small"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={onDelete}
            sx={{ fontSize: '0.75rem', py: 0.25 }}
          >
            Clear
          </Button>
        )}
      </Box>

      <Box sx={{ flexGrow: 1, p: 2, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {isLoading ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <CircularProgress size={36} sx={{ mb: 2 }} />
            <Typography variant="body2" color="text.secondary">
              Transcribing handwriting & scoring...
            </Typography>
          </Box>
        ) : imageUrl ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box
              sx={{
                flexGrow: 1,
                minHeight: 340,
                maxHeight: 520,
                borderRadius: 1.5,
                overflow: 'hidden',
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={imageUrl}
                alt="Student Answer Script"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250" viewBox="0 0 400 250"><rect width="400" height="250" fill="%231e293b"/><text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-family="sans-serif" font-size="14">Sample Handwritten Script Photo</text><text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" fill="%2364748b" font-family="sans-serif" font-size="12">(Mock Preview - Connect backend for raw scans)</text></svg>';
                }}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            </Box>
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
              <Button
                {...getRootProps()}
                size="small"
                variant="outlined"
                startIcon={<RefreshIcon />}
                disabled={isLoading}
              >
                <input {...getInputProps()} />
                Replace Photograph
              </Button>
            </Box>
          </Box>
        ) : (
          <Box
            {...getRootProps()}
            sx={{
              border: '2px dashed',
              borderColor: isDragActive ? 'primary.main' : 'divider',
              borderRadius: 2,
              p: 4,
              textAlign: 'center',
              cursor: 'pointer',
              bgcolor: isDragActive ? 'primary.50' : 'background.default',
              transition: 'all 0.15s ease',
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: 'action.hover',
              },
            }}
          >
            <input {...getInputProps()} />
            <PhotoCameraIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1, opacity: 0.8 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }} gutterBottom>
              {isDragActive ? 'Drop image here...' : 'Photograph or Upload Script'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 220, mx: 'auto' }}>
              Upload JPG or PNG photograph of the handwritten answer for this question.
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
}
