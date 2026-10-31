import React from 'react';
import TextField from '@mui/material/TextField';

interface MarkInputProps {
  value: number | '';
  maxMarks: number;
  disabled?: boolean;
  onChange: (value: number | '') => void;
  error?: boolean;
  helperText?: string;
}

/**
 * Shared component owned by F2, imported by F1.
 */
export function MarkInput({
  value,
  maxMarks,
  disabled = false,
  onChange,
  error = false,
  helperText,
}: MarkInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    if (rawVal === '') {
      onChange('');
      return;
    }
    const num = parseFloat(rawVal);
    if (!isNaN(num)) {
      onChange(Math.min(Math.max(num, 0), maxMarks));
    }
  };

  return (
    <TextField
      type="number"
      size="small"
      value={value}
      onChange={handleChange}
      disabled={disabled}
      error={error}
      helperText={helperText}
      slotProps={{
        htmlInput: {
          min: 0,
          max: maxMarks,
          step: 0.5,
        },
      }}
      sx={{ width: 100 }}
    />
  );
}
