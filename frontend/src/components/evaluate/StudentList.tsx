import { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Chip from '@mui/material/Chip';
import InputAdornment from '@mui/material/InputAdornment';
import SearchIcon from '@mui/icons-material/Search';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import type { StudentSummary } from '../../api/types.ts';
import { NewStudentDialog } from './NewStudentDialog.tsx';

interface StudentListProps {
  students: StudentSummary[];
  selectedUsn: string | null;
  onSelectStudent: (usn: string) => void;
  onCreateStudent: (data: { usn: string; name: string }) => void;
  isCreating: boolean;
}

export function StudentList({
  students,
  selectedUsn,
  onSelectStudent,
  onCreateStudent,
  isCreating,
}: StudentListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) => s.usn.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    );
  }, [students, searchQuery]);

  const handleCreate = (data: { usn: string; name: string }) => {
    onCreateStudent(data);
    setIsDialogOpen(false);
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        height: '100%',
        minHeight: 640,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 2,
        overflow: 'hidden',
        bgcolor: 'background.paper',
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Students
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {students.length} {students.length === 1 ? 'record' : 'records'}
            </Typography>
          </Box>
          <Button
            size="small"
            variant="contained"
            color="primary"
            startIcon={<PersonAddIcon />}
            onClick={() => setIsDialogOpen(true)}
            sx={{ borderRadius: 1.5, fontSize: '0.75rem', px: 1.5 }}
          >
            New USN
          </Button>
        </Box>

        <TextField
          size="small"
          placeholder="Search USN or Name..."
          fullWidth
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
            },
          }}
          sx={{ '& .MuiInputBase-input': { fontSize: '0.8125rem' } }}
        />
      </Box>

      {/* Student List Items */}
      <List sx={{ flexGrow: 1, overflowY: 'auto', p: 1, gap: 0.5, display: 'flex', flexDirection: 'column' }}>
        {filteredStudents.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body2">
              {searchQuery ? 'No student matches search' : 'No students added yet'}
            </Typography>
          </Box>
        ) : (
          filteredStudents.map((student) => {
            const isSelected = student.usn === selectedUsn;
            const isComplete = student.status === 'complete';
            const hasFlags = student.flags > 0;

            return (
              <ListItemButton
                key={student.usn}
                selected={isSelected}
                onClick={() => onSelectStudent(student.usn)}
                sx={{
                  borderRadius: 1.5,
                  mb: 0.5,
                  p: 1.5,
                  border: '1px solid',
                  borderColor: isSelected ? 'primary.main' : 'divider',
                  bgcolor: isSelected ? 'primary.50' : 'background.paper',
                  '&:hover': {
                    bgcolor: isSelected ? 'primary.100' : 'action.hover',
                  },
                }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: isSelected ? 'primary.main' : 'text.primary' }}>
                        {student.usn}
                      </Typography>
                      {isComplete ? (
                        <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} titleAccess="Completed" />
                      ) : (
                        <PendingIcon sx={{ fontSize: 16, color: 'warning.main' }} titleAccess="In Progress" />
                      )}
                    </Box>
                  }
                  secondary={
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 120 }}>
                        {student.name || 'Unnamed'}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                          {student.answered}/{student.total}
                        </Typography>
                        {hasFlags && (
                          <Chip
                            size="small"
                            color="error"
                            label={`${student.flags} flag`}
                            icon={<WarningAmberIcon sx={{ fontSize: '12px !important' }} />}
                            sx={{ height: 18, fontSize: '0.6875rem', fontWeight: 600, px: 0.25 }}
                          />
                        )}
                      </Box>
                    </Box>
                  }
                />
              </ListItemButton>
            );
          })
        )}
      </List>

      <NewStudentDialog
        open={isDialogOpen}
        isLoading={isCreating}
        onClose={() => setIsDialogOpen(false)}
        onSubmit={handleCreate}
      />
    </Paper>
  );
}
