import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableFooter from '@mui/material/TableFooter';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import type { Marksheet, MarksheetRow } from '../../api/types.ts';

interface MarksheetTableProps {
  sheet: Marksheet;
  rows: MarksheetRow[];
  onRowClick?: (usn: string) => void;
}

function formatMark(value: number | undefined): string {
  if (value === undefined) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function MarksheetTable({ sheet, rows, onRowClick }: MarksheetTableProps) {
  const flaggedRows = rows.filter((row) => row.flags > 0).length;
  const classAverage =
    sheet.class_average === null ? '—' : formatMark(sheet.class_average);

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Table size="medium" aria-label="Marksheet">
        <TableHead sx={{ bgcolor: 'action.hover' }}>
          <TableRow>
            <TableCell sx={{ fontWeight: 600 }}>USN</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
            {sheet.questions.map((question) => (
              <TableCell key={question.question_id} align="center" sx={{ fontWeight: 600 }}>
                Q{question.number}
                <br />
                <Typography component="span" variant="caption" color="text.secondary">
                  ({question.max_marks}m)
                </Typography>
              </TableCell>
            ))}
            <TableCell align="right" sx={{ fontWeight: 600 }}>Total</TableCell>
            <TableCell align="center" sx={{ fontWeight: 600 }}>Flags</TableCell>
            <TableCell align="center" sx={{ fontWeight: 600 }}>Review</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.usn}
              hover={Boolean(onRowClick)}
              onClick={onRowClick ? () => onRowClick(row.usn) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onRowClick(row.usn);
                      }
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              sx={{
                cursor: onRowClick ? 'pointer' : 'default',
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: -2,
                },
              }}
            >
              <TableCell component="th" scope="row" sx={{ fontWeight: 600, color: 'text.primary' }}>
                {row.usn}
              </TableCell>
              <TableCell>{row.name || '—'}</TableCell>
              {sheet.questions.map((question) => {
                const mark = row.marks[String(question.question_id)];
                return (
                  <TableCell key={question.question_id} align="center">
                    {formatMark(mark)}
                  </TableCell>
                );
              })}
              <TableCell align="right">
                <Box
                  component="span"
                  sx={{
                    fontWeight: 700,
                    px: 1,
                    py: 0.25,
                    borderRadius: 1,
                    bgcolor: 'primary.50',
                    color: 'primary.main',
                  }}
                >
                  {formatMark(row.total)}
                </Box>
              </TableCell>
              <TableCell align="center">
                {row.flags > 0 ? (
                  <Chip size="small" color="warning" label={row.flags} sx={{ fontWeight: 600 }} />
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell align="center">
                <Chip
                  size="small"
                  variant={row.review_status === 'reviewed' ? 'filled' : 'outlined'}
                  color={row.review_status === 'reviewed' ? 'success' : 'default'}
                  label={row.review_status}
                  sx={{ textTransform: 'capitalize', fontWeight: 500 }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter sx={{ bgcolor: 'action.hover' }}>
          <TableRow>
            <TableCell colSpan={2 + sheet.questions.length} align="right" sx={{ fontWeight: 600 }}>
              Class average
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>{classAverage}</TableCell>
            <TableCell align="center" sx={{ fontWeight: 600 }}>{flaggedRows} flagged</TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </TableContainer>
  );
}
