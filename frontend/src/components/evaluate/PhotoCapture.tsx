import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import ImageIcon from '@mui/icons-material/Image';
import ReplayIcon from '@mui/icons-material/Replay';

interface Props { disabled?: boolean; hasExistingAnswer?: boolean; isUploading: boolean; progress: number; error: string | null; onUpload: (file: File) => void; onRetake: () => void }
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024;

export function PhotoCapture({ disabled = false, hasExistingAnswer = false, isUploading, progress, error, onUpload, onRetake }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const selectFile = (file: File | undefined) => {
    if (!file) return;
    if (!TYPES.includes(file.type)) { setFileError('Choose a JPEG, PNG, or WebP image.'); return; }
    if (file.size > MAX_SIZE) { setFileError('Image must be 10 MB or smaller.'); return; }
    setFileError(null);
    setSelectedFile(file);
    setPreview((previous) => { if (previous) URL.revokeObjectURL(previous); return URL.createObjectURL(file); });
    onUpload(file);
  };
  return <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
    <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Answer image</Typography>
    <input ref={fileInput} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectFile(event.target.files?.[0])} />
    <input ref={cameraInput} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => selectFile(event.target.files?.[0])} />
    {preview ? <Box component="img" src={preview} alt="Selected answer script" sx={{ width: '100%', maxHeight: 310, objectFit: 'contain', borderRadius: 1, bgcolor: 'background.default' }} /> :
      <Box sx={{ minHeight: 230, display: 'grid', placeItems: 'center', bgcolor: 'background.default', borderRadius: 1, color: 'text.secondary' }}><Box sx={{ textAlign: 'center' }}><ImageIcon sx={{ fontSize: 42, opacity: 0.55 }} /><Typography variant="body2">No answer image uploaded</Typography></Box></Box>}
    {isUploading && <Box sx={{ mt: 1.5 }}><LinearProgress variant="determinate" value={progress} /><Typography variant="caption" color="text.secondary">Uploading {progress}%</Typography></Box>}
    {(fileError || error) && <Typography role="alert" variant="body2" color="error" sx={{ mt: 1 }}>{fileError || error}</Typography>}
    <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
      <Button size="small" variant="outlined" startIcon={<ImageIcon />} onClick={() => fileInput.current?.click()} disabled={disabled || isUploading}>Choose photo</Button>
      <Button size="small" variant="outlined" startIcon={<CameraAltIcon />} onClick={() => cameraInput.current?.click()} disabled={disabled || isUploading}>Camera</Button>
      {(preview || hasExistingAnswer) && <Button size="small" color="inherit" startIcon={<ReplayIcon />} onClick={() => { setPreview(null); setSelectedFile(null); if (fileInput.current) fileInput.current.value = ''; if (cameraInput.current) cameraInput.current.value = ''; onRetake(); }} disabled={disabled || isUploading}>{preview ? 'Retake' : 'Replace photo'}</Button>}
      {(error || fileError) && selectedFile && <Button size="small" onClick={() => onUpload(selectedFile)} disabled={disabled || isUploading}>Retry upload</Button>}
    </Stack>
  </Paper>;
}
