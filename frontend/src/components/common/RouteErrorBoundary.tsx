import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';

interface RouteErrorBoundaryProps {
  children: ReactNode;
}

interface RouteErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page render failed:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <Box sx={{ py: 4 }}>
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => window.location.reload()}>
                Reload
              </Button>
            }
          >
            <AlertTitle>This page could not be rendered</AlertTitle>
            {this.state.error.message || 'An unexpected error occurred.'}
          </Alert>
        </Box>
      );
    }

    return this.props.children;
  }
}

/** Keeps the app shell visible and shows the error instead of a blank page. */
export function RouteErrorBoundary({ children }: RouteErrorBoundaryProps) {
  const location = useLocation();

  return <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>;
}
