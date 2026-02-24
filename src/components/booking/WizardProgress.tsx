/**
 * WizardProgress — step indicator bar for the booking wizard.
 */
import { WIZARD_STEPS } from '@/lib/constants';

const STEP_LABELS: Record<string, string> = {
  'session-type': 'Session',
  'date': 'Date',
  'time': 'Time',
  'details': 'Details',
  'confirmation': 'Confirm',
};

interface WizardProgressProps {
  currentStep: string;
}

export function WizardProgress({ currentStep }: WizardProgressProps) {
  const currentIndex = WIZARD_STEPS.indexOf(currentStep as typeof WIZARD_STEPS[number]);
  const total = WIZARD_STEPS.length;
  const label = STEP_LABELS[currentStep] ?? currentStep;

  return (
    <nav
      aria-label={`Step ${currentIndex + 1} of ${total}: ${label}`}
      className="w-full mb-6"
    >
      <div className="flex items-center gap-1">
        {WIZARD_STEPS.map((step, index) => {
          const isPast = index < currentIndex;
          const isCurrent = index === currentIndex;
          const stepLabel = STEP_LABELS[step] ?? step;

          return (
            <div key={step} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={[
                    'w-full h-1.5 rounded-full transition-colors duration-200',
                    isPast || isCurrent
                      ? 'bg-accent'
                      : 'bg-gray-200',
                  ].join(' ')}
                  aria-hidden="true"
                />
                <span
                  className={[
                    'mt-1 text-xs font-medium hidden sm:block',
                    isCurrent ? 'text-accent' : isPast ? 'text-gray-500' : 'text-gray-300',
                  ].join(' ')}
                >
                  {stepLabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {/* Mobile: show only current step label */}
      <p className="sm:hidden mt-1 text-xs text-gray-500 text-center">
        Step {currentIndex + 1} of {total}: {label}
      </p>
    </nav>
  );
}
