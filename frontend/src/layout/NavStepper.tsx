import Box from '@mui/material/Box';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepButton from '@mui/material/StepButton';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ExamStateName } from '../api/types.ts';

interface NavStepperProps {
  examState?: ExamStateName;
}

interface StepItem {
  label: string;
  route: string;
}

const STEPS: StepItem[] = [
  { label: 'Setup', route: '/setup' },
  { label: 'Evaluate', route: '/evaluate' },
  { label: 'Marksheet', route: '/marksheet' },
];

export function NavStepper({ examState = 'NO_KEY' }: NavStepperProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const getActiveStep = () => {
    if (location.pathname.startsWith('/evaluate')) return 1;
    if (location.pathname.startsWith('/marksheet')) return 2;
    return 0;
  };

  const isStepDisabled = (index: number) => {
    if (index === 0) return false;
    // Step 1 (Evaluate) and Step 2 (Marksheet) require exam to be READY or FINAL
    return examState === 'NO_KEY' || examState === 'KEY_PARSED';
  };

  return (
    <Box sx={{ width: '100%', maxWidth: 640, mx: 'auto', my: 2 }}>
      <Stepper nonLinear activeStep={getActiveStep()}>
        {STEPS.map((step, index) => {
          const disabled = isStepDisabled(index);
          return (
            <Step key={step.label} completed={index < getActiveStep()}>
              <StepButton
                disabled={disabled}
                onClick={() => {
                  if (!disabled) {
                    navigate(step.route);
                  }
                }}
              >
                {step.label}
              </StepButton>
            </Step>
          );
        })}
      </Stepper>
    </Box>
  );
}
