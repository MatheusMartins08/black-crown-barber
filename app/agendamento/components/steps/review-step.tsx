import type { ReactNode } from "react";
import { CircleAlert, Info } from "lucide-react";
import {
  ANY_PROFESSIONAL,
  formatCurrency,
  formatLongDate,
  getProfessional,
  getService,
  type BookingDraft,
} from "../../../data/booking";
import { getPlan } from "../../../data/plans";
import type { PlanCoverage, SubscriberSession } from "../../../data/subscribers";
import { formatWeek, getCoverageNote, getPriceLabel } from "../../lib/plan-pricing";
import ProfessionalAvatar from "../professional-avatar";
import type { StepId } from "../use-booking-draft";

type ReviewStepProps = {
  draft: BookingDraft;
  onEdit: (step: StepId) => void;
  error: { message: string; canPickAnotherTime: boolean } | null;
  /** Assinante logado (os dados vêm da conta). */
  session: SubscriberSession | null;
  coverage: PlanCoverage | null;
  /** A cobertura da data escolhida ainda está sendo conferida. */
  checkingCoverage: boolean;
};

export default function ReviewStep({ draft, onEdit, error, session, coverage, checkingCoverage }: ReviewStepProps) {
  const service = getService(draft.serviceId);
  const assignee = getProfessional(draft.assignedProfessionalId);
  if (!service || !draft.date || !draft.time) return null;

  const coverageNote = session ? getCoverageNote(coverage) : null;
  const rows: { label: string; value: ReactNode; step: StepId }[] = [
    {
      label: "Serviço",
      value: (
        <span className="booking-review__stack">
          {service.name}
          {coverageNote && !checkingCoverage ? <small>{coverageNote}</small> : null}
        </span>
      ),
      step: "servico",
    },
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
      step: "profissional",
    },
    { label: "Data", value: formatLongDate(draft.date), step: "horario" },
    { label: "Horário", value: draft.time, step: "horario" },
    { label: "Duração", value: service.duration, step: "servico" },
    session
      ? {
          label: "Assinante",
          value: (
            <span className="booking-review__stack">
              {session.name}
              <small>{session.phone}</small>
              <small>{getPlan(session.planId)?.name}</small>
            </span>
          ),
          step: "perfil",
        }
      : {
          label: "Seus dados",
          value: (
            <span className="booking-review__stack">
              {draft.customer.name.trim()}
              <small>{draft.customer.phone}</small>
              {draft.customer.email.trim() ? <small>{draft.customer.email.trim()}</small> : null}
              {draft.customer.whatsappOptIn ? <small>Lembretes pelo WhatsApp</small> : null}
            </span>
          ),
          step: "dados",
        },
  ];

  const showLimitNotice = session && coverage?.reason === "limite_semanal" && !checkingCoverage;

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
          {session && checkingCoverage ? (
            <strong aria-live="polite" className="booking-review__checking">
              Conferindo o plano…
            </strong>
          ) : (
            <strong key={coverage?.reason ?? "avulso"}>
              {session ? getPriceLabel(service.price, coverage) : formatCurrency(service.price)}
            </strong>
          )}
        </div>
      </div>

      {showLimitNotice && coverage ? (
        <div className="booking-alert" role="status">
          <p>
            <Info aria-hidden="true" size={16} />
            <span>
              <strong>O benefício de {service.name.toLowerCase()} desta semana já foi usado.</strong> Na semana de{" "}
              {formatWeek(coverage)}, este horário será cobrado como avulso ({formatCurrency(service.price)}).
            </span>
          </p>
          <button className="booking-text-button" onClick={() => onEdit("horario")} type="button">
            Escolher outra data
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="booking-alert" role="alert">
          <p>
            <CircleAlert aria-hidden="true" size={16} />
            <strong>{error.message}</strong>
          </p>
          {error.canPickAnotherTime ? (
            <button className="booking-text-button" onClick={() => onEdit("horario")} type="button">
              Escolher outro horário
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
