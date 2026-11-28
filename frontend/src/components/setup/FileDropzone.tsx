import { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function FileDropzone({ onFileSelect, isLoading = false, disabled = false }: FileDropzoneProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      setErrorMessage(null);

      if (fileRejections.length > 0) {
        const rejection = fileRejections[0];
        const error = rejection.errors[0];
        if (error.code === 'file-too-large') {
          setErrorMessage('File exceeds the 10 MB limit.');
        } else if (error.code === 'file-invalid-type') {
          setErrorMessage('Invalid file type. Only .pdf and .docx files are accepted.');
        } else {
          setErrorMessage(error.message);
        }
        return;
      }

      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
    disabled: disabled || isLoading,
  });

  return (
    <Box sx={{ width: '100%', mb: 3 }}>
      <Box
        {...getRootProps()}
        sx={{
          border: '2px dashed',
          borderColor: isDragActive ? 'primary.main' : disabled ? 'action.disabled' : 'divider',
          borderRadius: 2,
          p: 4,
          textAlign: 'center',
          bgcolor: isDragActive ? 'action.hover' : disabled ? 'action.disabledBackground' : 'background.paper',
          cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            borderColor: disabled || isLoading ? undefined : 'primary.main',
            bgcolor: disabled || isLoading ? undefined : 'action.hover',
          },
        }}
      >
        <input {...getInputProps()} />
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 64,
            height: 64,
            borderRadius: '50%',
            bgcolor: isDragActive ? 'rgba(108, 76, 241, 0.16)' : 'rgba(108, 76, 241, 0.10)',
            color: 'primary.main',
            mb: 2,
          }}
        >
          <CloudUploadIcon sx={{ fontSize: 36 }} />
        </Box>
        <Typography variant="h6" color={disabled ? 'text.disabled' : 'text.primary'} gutterBottom sx={{ fontWeight: 600 }}>
          {isDragActive
            ? 'Drop the answer key file here...'
            : 'Upload official answer key'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 440, mx: 'auto', mb: 2 }}>
          Drag and drop your born-digital question paper or model answer document, or click to browse.
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
          <Chip label=".PDF" size="small" variant="outlined" sx={{ fontWeight: 600, fontSize: '0.75rem' }} />
          <Chip label=".DOCX" size="small" variant="outlined" sx={{ fontWeight: 600, fontSize: '0.75rem' }} />
          <Chip label="Up to 10 MB" size="small" variant="outlined" sx={{ fontWeight: 500, fontSize: '0.75rem' }} />
        </Box>
      </Box>

      {isLoading && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, textAlign: 'center' }}>
            Uploading and parsing answer key...
          </Typography>
        </Box>
      )}

      {errorMessage && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}
    </Box>
  );
}
