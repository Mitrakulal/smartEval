import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Slider from '@mui/material/Slider';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import type { SyntheticEvent } from 'react';

interface SliderFieldProps {
  pointThreshold: number;
  borderlineBand: number;
  disabled?: boolean;
  onChange: (settings: { pointThreshold: number; borderlineBand: number }) => void;
  onCommit: (settings: { pointThreshold: number; borderlineBand: number }) => void;
}

export function SliderField({
  pointThreshold,
  borderlineBand,
  disabled = false,
  onChange,
  onCommit,
}: SliderFieldProps) {
  const handleThresholdChange = (_: Event, value: number | number[]) => {
    onChange({
      pointThreshold: value as number,
      borderlineBand,
    });
  };

  const handleBandChange = (_: Event, value: number | number[]) => {
    onChange({
      pointThreshold,
      borderlineBand: value as number,
    });
  };

  const handleThresholdCommit = (_: Event | SyntheticEvent, value: number | number[]) => {
    onCommit({
      pointThreshold: value as number,
      borderlineBand,
    });
  };

  const handleBandCommit = (_: Event | SyntheticEvent, value: number | number[]) => {
    onCommit({
      pointThreshold,
      borderlineBand: value as number,
    });
  };

  return (
    <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
      <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
        Evaluation Threshold Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tune the semantic matching parameters for automatic answer evaluation.
      </Typography>

      <Grid container spacing={4}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={{ px: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                Strictness (Point Threshold)
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>
                {pointThreshold.toFixed(2)}
              </Typography>
            </Box>
            <Slider
              value={pointThreshold}
              min={0.4}
              max={0.75}
              step={0.05}
              disabled={disabled}
              valueLabelDisplay="auto"
              onChange={handleThresholdChange}
              onChangeCommitted={handleThresholdCommit}
            />
            <Typography variant="caption" color="text.secondary">
              Minimum similarity score to award key point coverage (default 0.55).
            </Typography>
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={{ px: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                Review Band (Borderline Margin)
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>
                ±{borderlineBand.toFixed(2)}
              </Typography>
            </Box>
            <Slider
              value={borderlineBand}
              min={0.05}
              max={0.2}
              step={0.01}
              disabled={disabled}
              valueLabelDisplay="auto"
              onChange={handleBandChange}
              onChangeCommitted={handleBandCommit}
            />
            <Typography variant="caption" color="text.secondary">
              Scores within this distance from threshold trigger borderline review flag (default 0.10).
            </Typography>
          </Box>
        </Grid>
      </Grid>
    </Paper>
  );
}
