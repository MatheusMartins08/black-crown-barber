import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import {
  ANY_PROFESSIONAL,
  formatCurrency,
  formatLongDate,
  getProfessional,
  getService,
  type BookingDraft,
} from "../../../data/booking";
import ProfessionalAvatar from "../professional-avatar";
import type { StepIndex } from "../use-booking-draft";

type ReviewStepProps = {
  draft: BookingDraft;
  onEdit: (step: StepIndex) => void;
  error: { message: string; canPickAnotherTime: boolean } | null;
};

export default function ReviewStep({ draft, onEdit, error }: ReviewStepProps) {
  const service = getService(draft.serviceId);
  const assignee = getProfessional(draft.assignedProfessionalId);
  if (!service || !draft.date || !draft.time) return null;

  const rows: { label: string; value: ReactNode; step: StepIndex }[] = [
    { label: "Serviço", value: service.name, step: 0 },
    {
      label: "Profissional",
      value: (
        <span className="booking-review__person">
          <ProfessionalAvatar professionalId={assignee?.id ?? null} size={26} />
          <span>
            {assignee?.name ?? "Qualquer profissional"}
            {draft.professionalId === ANY_PROFESSIONAL ? <small>Primeiro profissional livre</small> : null}
          </span>
        </span>
      ),
      step: 1,
    },
    { label: "Data", value: formatLongDate(draft.date), step: 2 },
    { label: "Horário", value: draft.time, step: 2 },
    { label: "Duração", value: service.duration, step: 0 },
    {
      label: "Seus dados",
      value: (
        <span className="booking-review__stack">
          {draft.customer.name.trim()}
          <small>{draft.customer.phone}</small>
          {draft.customer.email.trim() ? <small>{draft.customer.email.trim()}</small> : null}
        </span>
      ),
      step: 3,
    },
  ];

  if (draft.customer.notes.trim()) {
    rows.push({ label: "Observações", value: draft.customer.notes.trim(), step: 3 });
  }

  return (
    <div className="booking-review-wrap">
      <div className="booking-review">
        <dl className="booking-review__list">
          {rows.map((row) => (
            <div className="booking-review__row" key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
              <button
                aria-label={`Alterar ${row.label.toLowerCase()}`}
                className="booking-text-button booking-review__edit"
                onClick={() => onEdit(row.step)}
                type="button"
              >
                Alterar
              </button>
            </div>
          ))}
        </dl>
        <div className="booking-review__total">
          <span>Valor</span>
          <strong>{formatCurrency(service.price)}</strong>
        </div>
      </div>

      {error ? (
        <div className="booking-alert" role="alert">
          <p>
            <CircleAlert aria-hidden="true" size={16} />
            <strong>{error.message}</strong>
          </p>
          {error.canPickAnotherTime ? (
            <button className="booking-text-button" onClick={() => onEdit(2)} type="button">
              Escolher outro horário
            </button>
          ) : null}
        </div>
      ) : null}

      <p className="booking-review__note">
        Agendamento demonstrativo · nenhuma reserva real é criada. Valores e durações demonstrativos.
      </p>
    </div>
  );
}
