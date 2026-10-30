import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import DescriptionIcon from '@mui/icons-material/Description';

interface PdfPreviewProps {
  fileBlob?: Blob | null;
  filename?: string | null;
  isLoading?: boolean;
}

export function PdfPreview({ fileBlob, filename, isLoading = false }: PdfPreviewProps) {
  const isDocx = filename?.toLowerCase().endsWith('.docx');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!fileBlob || isDocx) {
      return;
    }
    const timer = setTimeout(() => {
      setBlobUrl(URL.createObjectURL(fileBlob));
    }, 0);

    return () => {
      clearTimeout(timer);
      setBlobUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
    };
  }, [fileBlob, isDocx]);

  return (
    <Paper
      variant="outlined"
      sx={{
        height: '100%',
        minHeight: 520,
        maxHeight: 750,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: 'background.paper',
      }}
    >
      <Box
        sx={{
          p: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.default',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <DescriptionIcon fontSize="small" color="primary" />
        <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600 }}>
          {filename ? `Preview: ${filename}` : 'Document Preview'}
        </Typography>
      </Box>

      <Box sx={{ flexGrow: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {isLoading ? (
          <Box sx={{ width: '100%', p: 2 }}>
            <Skeleton variant="rectangular" width="100%" height="100%" sx={{ minHeight: 460 }} />
          </Box>
        ) : isDocx ? (
          <Box sx={{ p: 3, width: '100%', overflowY: 'auto' }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              DOCX document uploaded ({filename}).
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Inline visual rendering is native for PDF. Questions extracted from this DOCX are displayed in the Question Editor on the right.
            </Typography>
          </Box>
        ) : blobUrl ? (
          <iframe
            src={`${blobUrl}#toolbar=0`}
            title="PDF Preview"
            width="100%"
            height="100%"
            style={{ border: 'none', minHeight: 480 }}
          />
        ) : (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              p: 3,
              color: 'text.secondary',
            }}
          >
            <DescriptionIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
            <Typography variant="body2">No preview available</Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
}
