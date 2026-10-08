import type { ReactNode } from "react";
import { CircleAlert, Info } from "lucide-react";
import {
  ANY_PROFESSIONAL,
  formatCurrency,
  formatLongDate,
  getProfessional,
  getServices,
  sumServices,
  type BookingDraft,
} from "../../../data/booking";
import { getPlan } from "../../../data/plans";
import { formatDuration } from "../../../data/services";
import type { SubscriberSession } from "../../../data/subscribers";
import { formatWeek, getCoverageNote, getPriceLabel, getTotalLabel, type CoverageMap } from "../../lib/plan-pricing";
import { useBookingPlans, useBookingProfessionals, useBookingServices } from "../booking-catalog";
import ProfessionalAvatar from "../professional-avatar";
import type { StepId } from "../use-booking-draft";

type ReviewStepProps = {
  draft: BookingDraft;
  onEdit: (step: StepId) => void;
  error: { message: string; canPickAnotherTime: boolean } | null;
  /** Assinante logado (os dados vêm da conta). */
  session: SubscriberSession | null;
  /** Cobertura do plano de cada serviço escolhido. */
  coverage: CoverageMap;
  /** A cobertura da data escolhida ainda está sendo conferida. */
  checkingCoverage: boolean;
};

export default function ReviewStep({ draft, onEdit, error, session, coverage, checkingCoverage }: ReviewStepProps) {
  const items = getServices(useBookingServices(), draft.serviceIds);
  const plans = useBookingPlans();
  const assignee = getProfessional(useBookingProfessionals(), draft.assignedProfessionalId);
  if (!items.length || !draft.date || !draft.time) return null;

  const totals = sumServices(items);
  const showPrices = items.length > 1;
  const rows: { label: string; value: ReactNode; step: StepId }[] = [
    {
      label: items.length > 1 ? "Serviços" : "Serviço",
      value: (
        <span className="booking-review__items">
          {items.map((item) => {
            const note = session && !checkingCoverage ? getCoverageNote(coverage[item.slug] ?? null, plans) : null;
            return (
              <span className="booking-review__stack" key={item.slug}>
                {item.name}
                {showPrices ? (
                  <small>
                    {formatDuration(item.durationMinutes)} ·{" "}
                    {session && !checkingCoverage
                      ? getPriceLabel(item.price, coverage[item.slug] ?? null)
                      : formatCurrency(item.price)}
                  </small>
                ) : null}
                {note ? <small>{note}</small> : null}
              </span>
            );
          })}
        </span>
      ),
      step: "servico",
    },
    {
      label: "Profissional",
      value: (
        <span className="booking-review__person">
          <ProfessionalAvatar professionalId={assignee?.slug ?? null} size={26} />
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
    { label: "Duração", value: formatDuration(totals.durationMinutes), step: "servico" },
    session
      ? {
          label: "Assinante",
          value: (
            <span className="booking-review__stack">
              {session.name}
              <small>{session.phone}</small>
              <small>{getPlan(plans, session.planId)?.name}</small>
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

  // Serviços cujo benefício do período já foi usado: saem pelo valor avulso.
  const limited = session && !checkingCoverage
    ? items.flatMap((item) => {
        const itemCoverage = coverage[item.slug];
        return itemCoverage && (itemCoverage.reason === "limite_semanal" || itemCoverage.reason === "limite_mensal")
          ? [{ item, coverage: itemCoverage }]
          : [];
      })
    : [];

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
            <strong key={Object.values(coverage).map((item) => item?.reason).join() || "avulso"}>
              {getTotalLabel(items, session ? coverage : null) ?? formatCurrency(totals.price)}
            </strong>
          )}
        </div>
      </div>

      {limited.map(({ item, coverage: itemCoverage }) => {
        const isMonthlyLimit = itemCoverage.reason === "limite_mensal";
        return (
          <div className="booking-alert" key={item.slug} role="status">
            <p>
              <Info aria-hidden="true" size={16} />
              <span>
                <strong>
                  O benefício de {item.name.toLowerCase()} {isMonthlyLimit ? "deste mês do plano" : "desta semana"} já foi
                  usado.
                </strong>{" "}
                {isMonthlyLimit ? "No período de" : "Na semana de"} {formatWeek(itemCoverage)},{" "}
                {items.length > 1 ? "este serviço será cobrado" : "este horário será cobrado"} como avulso (
                {formatCurrency(item.price)}).
              </span>
            </p>
            <button className="booking-text-button" onClick={() => onEdit("horario")} type="button">
              Escolher outra data
            </button>
          </div>
        );
      })}

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
