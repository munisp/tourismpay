import { CheckCircle, Circle, Clock } from "lucide-react";

interface Step {
  id: number;
  label: string;
  description?: string;
}

interface KybStepperProps {
  steps: Step[];
  activeStep: number;
  /** Compact mode: horizontal inline layout (default). Set to false for vertical layout. */
  vertical?: boolean;
}

/**
 * KybStepper — visual step indicator for the KYB Onboarding wizard.
 *
 * States:
 *  - completed (i < activeStep): filled green circle with checkmark
 *  - active    (i === activeStep): filled primary circle with step number + pulse ring
 *  - upcoming  (i > activeStep): hollow muted circle with step number
 */
export default function KybStepper({ steps, activeStep, vertical = false }: KybStepperProps) {
  if (vertical) {
    return (
      <ol className="flex flex-col gap-0">
        {steps.map((step, i) => {
          const isCompleted = i < activeStep;
          const isActive = i === activeStep;
          const isUpcoming = i > activeStep;

          return (
            <li key={step.id} className="flex gap-3">
              {/* Left column: icon + connector line */}
              <div className="flex flex-col items-center">
                <div className="relative flex-shrink-0">
                  {isCompleted && (
                    <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_8px_oklch(0.72_0.18_160/0.4)]">
                      <CheckCircle className="w-4 h-4 text-white" />
                    </div>
                  )}
                  {isActive && (
                    <>
                      <div className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
                      <div className="relative w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-[0_0_10px_oklch(0.65_0.22_250/0.5)]">
                        <span className="text-[11px] font-bold text-primary-foreground">{i + 1}</span>
                      </div>
                    </>
                  )}
                  {isUpcoming && (
                    <div className="w-7 h-7 rounded-full border-2 border-white/15 bg-white/5 flex items-center justify-center">
                      <span className="text-[11px] font-medium text-muted-foreground">{i + 1}</span>
                    </div>
                  )}
                </div>
                {/* Connector line */}
                {i < steps.length - 1 && (
                  <div
                    className={`w-0.5 flex-1 my-1 min-h-[16px] rounded-full transition-colors duration-500 ${
                      isCompleted ? "bg-emerald-500/60" : "bg-white/10"
                    }`}
                  />
                )}
              </div>

              {/* Right column: label + description */}
              <div className={`pb-4 ${i === steps.length - 1 ? "pb-0" : ""}`}>
                <p
                  className={`text-xs font-semibold leading-7 transition-colors ${
                    isCompleted
                      ? "text-emerald-400"
                      : isActive
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </p>
                {step.description && (
                  <p className="text-[10px] text-muted-foreground leading-4">{step.description}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  // ─── Horizontal (default) ─────────────────────────────────────────────────
  return (
    <nav aria-label="KYB onboarding progress">
      <ol className="flex items-center gap-1 flex-wrap">
        {steps.map((step, i) => {
          const isCompleted = i < activeStep;
          const isActive = i === activeStep;

          return (
            <li key={step.id} className="flex items-center gap-1.5">
              {/* Step bubble */}
              <div className="flex items-center gap-1.5">
                <div className="relative flex-shrink-0">
                  {isCompleted && (
                    <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_6px_oklch(0.72_0.18_160/0.35)]">
                      <CheckCircle className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                  {isActive && (
                    <>
                      <div className="absolute inset-0 rounded-full bg-primary/25 animate-ping" />
                      <div className="relative w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-[0_0_8px_oklch(0.65_0.22_250/0.45)]">
                        <span className="text-[10px] font-bold text-primary-foreground">{i + 1}</span>
                      </div>
                    </>
                  )}
                  {!isCompleted && !isActive && (
                    <div className="w-6 h-6 rounded-full border border-white/15 bg-white/5 flex items-center justify-center">
                      <span className="text-[10px] font-medium text-muted-foreground">{i + 1}</span>
                    </div>
                  )}
                </div>
                <span
                  className={`text-xs transition-colors ${
                    isCompleted
                      ? "text-emerald-400 font-medium"
                      : isActive
                      ? "text-foreground font-semibold"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector arrow */}
              {i < steps.length - 1 && (
                <div
                  className={`w-6 h-0.5 rounded-full transition-colors duration-500 ${
                    isCompleted ? "bg-emerald-500/50" : "bg-white/10"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Progress bar */}
      <div className="mt-3 h-1 rounded-full bg-white/8 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-primary transition-all duration-700 ease-out"
          style={{ width: `${(activeStep / (steps.length - 1)) * 100}%` }}
        />
      </div>
    </nav>
  );
}
