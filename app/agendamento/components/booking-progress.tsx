import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import { bookingSteps, type StepIndex } from "./use-booking-draft";

type BookingProgressProps = {
  current: StepIndex;
  maxReachable: StepIndex;
  onSelect: (step: StepIndex) => void;
};

export default function BookingProgress({ current, maxReachable, onSelect }: BookingProgressProps) {
  return (
    <nav aria-label="Etapas do agendamento" className="booking-progress">
      <span
        aria-hidden="true"
        className="booking-progress__fill"
        style={{ "--progress": (current + 1) / bookingSteps.length } as CSSProperties}
      />
      <ol className="booking-progress__list">
        {bookingSteps.map((label, index) => {
          const step = index as StepIndex;
          const isCurrent = step === current;
          const isDone = !isCurrent && step < maxReachable;
          const canOpen = !isCurrent && step <= maxReachable;
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
            <li className="booking-progress__item" key={label}>
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
        Etapa {current + 1} de {bookingSteps.length} · <strong>{bookingSteps[current]}</strong>
      </p>
    </nav>
  );
}
