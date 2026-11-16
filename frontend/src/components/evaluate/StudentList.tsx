import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import type { StudentSummary } from '../../api/types.ts';

interface Props { students: StudentSummary[]; selectedUsn: string | null; canAdd?: boolean; onSelect: (usn: string) => void; onAdd: () => void }

export function StudentList({ students, selectedUsn, canAdd = true, onSelect, onAdd }: Props) {
  return <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
    <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Box><Typography variant="subtitle1">Students</Typography><Typography variant="caption" color="text.secondary">{students.length} enrolled</Typography></Box>
      <Button size="small" startIcon={<AddIcon />} onClick={onAdd} disabled={!canAdd}>Add</Button>
    </Box>
    <Divider />
    {students.length === 0 ? <Typography color="text.secondary" variant="body2" sx={{ p: 2.5 }}>No students yet.</Typography> :
      <List disablePadding sx={{ maxHeight: { md: 'calc(100vh - 300px)' }, overflowY: 'auto' }}>
        {students.map((student) => <ListItemButton key={student.usn} selected={student.usn === selectedUsn} onClick={() => onSelect(student.usn)} sx={{ alignItems: 'flex-start', py: 1.5 }}>
          <Avatar sx={{ width: 34, height: 34, mr: 1.5, bgcolor: student.flags ? 'warning.light' : 'primary.light', fontSize: 14 }}>{student.name ? student.name.slice(0, 1).toUpperCase() : student.usn.slice(-2)}</Avatar>
          <ListItemText primary={<Typography variant="body2" fontWeight={600}>{student.usn}</Typography>} secondary={<>
            <Typography component="span" variant="caption" color="text.secondary" display="block">{student.name || 'Name not provided'}</Typography>
            <Typography component="span" variant="caption" color="text.secondary">{student.answered}/{student.total} answered · {student.flags} flags{student.average !== null ? ` · avg ${student.average.toFixed(1)}` : ''}</Typography>
          </>} />
        </ListItemButton>)}
      </List>}
  </Paper>;
}
