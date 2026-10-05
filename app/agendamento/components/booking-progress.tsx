import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import { stepLabels, type StepId } from "./use-booking-draft";

type BookingProgressProps = {
  steps: readonly StepId[];
  current: StepId;
  maxReachable: StepId;
  onSelect: (step: StepId) => void;
};

export default function BookingProgress({ steps, current, maxReachable, onSelect }: BookingProgressProps) {
  const currentIndex = steps.indexOf(current);
  const maxIndex = steps.indexOf(maxReachable);

  return (
    <nav aria-label="Etapas do agendamento" className="booking-progress">
      <span
        aria-hidden="true"
        className="booking-progress__fill"
        style={{ "--progress": (currentIndex + 1) / steps.length } as CSSProperties}
      />
      <ol className="booking-progress__list" style={{ "--step-count": steps.length } as CSSProperties}>
        {steps.map((step, index) => {
          const label = stepLabels[step];
          const isCurrent = step === current;
          const isDone = !isCurrent && index < maxIndex;
          const canOpen = !isCurrent && index <= maxIndex;
          const className = `booking-progress__step${isCurrent ? " is-current" : ""}${isDone ? " is-done" : ""}`;
          const content = (
            <>
              <span aria-hidden="true" className="booking-progress__marker">
                {isDone ? <Check size={13} strokeWidth={2.4} /> : index + 1}
              </span>
              <span className="booking-progress__label">{label}</span>
            </>
          );

          return (
            <li className="booking-progress__item" key={step}>
              {canOpen ? (
                <button
                  aria-label={`Ir para a etapa ${label}${isDone ? " (concluída)" : ""}`}
                  className={className}
                  onClick={() => onSelect(step)}
                  type="button"
                >
                  {content}
                </button>
              ) : (
                <span aria-current={isCurrent ? "step" : undefined} className={className}>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="booking-progress__caption">
        Etapa {currentIndex + 1} de {steps.length} · <strong>{stepLabels[current]}</strong>
      </p>
    </nav>
  );
}
