import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

import { theme } from './theme/theme.ts';
import { AppShell } from './layout/AppShell.tsx';
import { SnackbarProvider } from './layout/SnackbarProvider.tsx';
import { Setup } from './routes/Setup.tsx';
import { Evaluate } from './routes/Evaluate.tsx';
import { Marksheet } from './routes/Marksheet.tsx';
import { NotFound } from './routes/NotFound.tsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SnackbarProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<Navigate to="/setup" replace />} />
                <Route path="/setup" element={<Setup />} />
                <Route path="/evaluate" element={<Evaluate />} />
                <Route path="/marksheet" element={<Marksheet />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </SnackbarProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
