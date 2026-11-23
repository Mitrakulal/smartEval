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
  description: string;
}

const STEPS: StepItem[] = [
  { label: 'Setup', route: '/setup', description: 'Upload & confirm key' },
  { label: 'Evaluate', route: '/evaluate', description: 'Score student answers' },
  { label: 'Marksheet', route: '/marksheet', description: 'Review & export CSV' },
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

  const activeStep = getActiveStep();

  return (
    <Box sx={{ width: '100%', maxWidth: 720, mx: 'auto', my: 1 }}>
      <Stepper nonLinear activeStep={activeStep}>
        {STEPS.map((step, index) => {
          const disabled = isStepDisabled(index);
          const isCurrent = activeStep === index;
          return (
            <Step key={step.label} completed={index < activeStep}>
              <StepButton
                disabled={disabled}
                onClick={() => {
                  if (!disabled) {
                    navigate(step.route);
                  }
                }}
                optional={
                  <Box component="span" sx={{ fontSize: '0.75rem', color: isCurrent ? 'primary.main' : 'text.secondary' }}>
                    {step.description}
                  </Box>
                }
              >
                <Box component="span" sx={{ fontWeight: isCurrent ? 700 : 500 }}>
                  {step.label}
                </Box>
              </StepButton>
            </Step>
          );
        })}
      </Stepper>
    </Box>
  );
}
