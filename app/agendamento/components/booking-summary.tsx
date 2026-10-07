"use client";

import { useState } from "react";
import { ChevronUp } from "lucide-react";
import {
  ANY_PROFESSIONAL,
  formatCurrency,
  formatLongDate,
  getProfessional,
  getService,
  type BookingDraft,
} from "../../data/booking";
import { getPlan } from "../../data/plans";
import type { PlanCoverage, SubscriberSession } from "../../data/subscribers";
import type { Professional } from "../../data/professionals";
import { formatDuration, type Service } from "../../data/services";
import { getPriceLabel } from "../lib/plan-pricing";
import { useBookingPlans, useBookingProfessionals, useBookingServices } from "./booking-catalog";
import PrimaryActionButton, { type PrimaryAction } from "./primary-action-button";
import ProfessionalAvatar from "./professional-avatar";

function getProfessionalLabel(draft: BookingDraft, professionals: readonly Professional[]) {
  if (!draft.professionalId) return null;
  const assignee = getProfessional(professionals, draft.assignedProfessionalId);
  if (draft.professionalId === ANY_PROFESSIONAL) return assignee ? assignee.name : "Qualquer profissional";
  return getProfessional(professionals, draft.professionalId)?.name ?? null;
}

/** Assinante logado e a cobertura do plano para o serviço escolhido. */
export type SummaryPlanInfo = { session: SubscriberSession | null; coverage: PlanCoverage | null };

function getTotal(service: Service | null, { session, coverage }: SummaryPlanInfo) {
  if (!service) return null;
  return session ? getPriceLabel(service.price, coverage) : formatCurrency(service.price);
}

function SummaryList({ draft, planInfo }: { draft: BookingDraft; planInfo: SummaryPlanInfo }) {
  const service = getService(useBookingServices(), draft.serviceId);
  const professionalLabel = getProfessionalLabel(draft, useBookingProfessionals());
  const professionalAvatarId =
    draft.professionalId === ANY_PROFESSIONAL ? draft.assignedProfessionalId : draft.professionalId;

  const { session } = planInfo;
  const plans = useBookingPlans();
  const rows = [
    ...(session
      ? [{ label: "Assinante", value: `${session.name.split(" ")[0]} · ${getPlan(plans, session.planId)?.shortName}` }]
      : []),
    { label: "Serviço", value: service?.name },
    {
      label: "Profissional",
      value: professionalLabel ? (
        <span className="summary-list__person">
          <ProfessionalAvatar professionalId={professionalAvatarId} size={22} />
          {professionalLabel}
        </span>
      ) : null,
      key: professionalLabel,
    },
    { label: "Data", value: draft.date ? formatLongDate(draft.date) : null },
    { label: "Horário", value: draft.time },
    { label: "Duração", value: service ? formatDuration(service.durationMinutes) : null },
  ];

  return (
    <dl className="summary-list">
      {rows.map((row) => (
        <div className={`summary-list__row${row.value ? "" : " is-empty"}`} key={row.label}>
          <dt>{row.label}</dt>
          {/* A chave reinicia a animação sempre que o valor muda. */}
          <dd key={String(row.key ?? row.value ?? "empty")}>{row.value ?? "A escolher"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function BookingSummaryPanel({ draft, planInfo }: { draft: BookingDraft; planInfo: SummaryPlanInfo }) {
  const total = getTotal(getService(useBookingServices(), draft.serviceId), planInfo);

  return (
    <aside aria-label="Resumo do agendamento" className="booking-summary">
      <p className="booking-summary__title">Seu agendamento</p>
      <SummaryList draft={draft} planInfo={planInfo} />
      <div className="booking-summary__total">
        <span>Total</span>
        <strong key={total ?? "empty"}>{total ?? "—"}</strong>
      </div>
    </aside>
  );
}

export function BookingSummaryBar({
  draft,
  action,
  planInfo,
}: {
  draft: BookingDraft;
  action: PrimaryAction;
  planInfo: SummaryPlanInfo;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const service = getService(useBookingServices(), draft.serviceId);
  const meta = [service ? formatDuration(service.durationMinutes) : null, getTotal(service, planInfo), draft.time]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={`booking-bar${isOpen ? " is-open" : ""}`}>
      <div className="booking-bar__panel" id="booking-bar-panel" inert={!isOpen}>
        <div className="booking-bar__panel-inner">
          <SummaryList draft={draft} planInfo={planInfo} />
        </div>
      </div>
      <div className="booking-bar__inner">
        <button
          aria-controls="booking-bar-panel"
          aria-expanded={isOpen}
          className="booking-bar__toggle"
          onClick={() => setIsOpen((open) => !open)}
          type="button"
        >
          <span className="booking-bar__title">{service?.name ?? "Escolha um serviço"}</span>
          <span className="booking-bar__meta">{meta || "Resumo do agendamento"}</span>
          <ChevronUp aria-hidden="true" className="booking-bar__chevron" size={18} />
          <span className="sr-only">{isOpen ? "Ocultar resumo" : "Ver resumo"}</span>
        </button>
        <PrimaryActionButton
          action={{
            ...action,
            onClick: () => {
              setIsOpen(false);
              action.onClick();
            },
          }}
          compact
        />
      </div>
    </div>
  );
}
