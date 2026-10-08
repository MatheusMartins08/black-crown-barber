"use client";

import { useState } from "react";
import { ChevronUp } from "lucide-react";
import {
  ANY_PROFESSIONAL,
  describeServices,
  formatCurrency,
  formatLongDate,
  getProfessional,
  getServices,
  sumServices,
  type BookingDraft,
} from "../../data/booking";
import { getPlan } from "../../data/plans";
import type { SubscriberSession } from "../../data/subscribers";
import type { Professional } from "../../data/professionals";
import { formatDuration, type Service } from "../../data/services";
import { getPriceLabel, getTotalLabel, type CoverageMap } from "../lib/plan-pricing";
import { useBookingPlans, useBookingProfessionals, useBookingServices } from "./booking-catalog";
import PrimaryActionButton, { type PrimaryAction } from "./primary-action-button";
import ProfessionalAvatar from "./professional-avatar";

function getProfessionalLabel(draft: BookingDraft, professionals: readonly Professional[]) {
  if (!draft.professionalId) return null;
  const assignee = getProfessional(professionals, draft.assignedProfessionalId);
  if (draft.professionalId === ANY_PROFESSIONAL) return assignee ? assignee.name : "Qualquer profissional";
  return getProfessional(professionals, draft.professionalId)?.name ?? null;
}

/** Assinante logado e a cobertura do plano de cada serviço escolhido. */
export type SummaryPlanInfo = { session: SubscriberSession | null; coverage: CoverageMap };

function getTotal(items: readonly Service[], { session, coverage }: SummaryPlanInfo) {
  return getTotalLabel(items, session ? coverage : null);
}

/** Um serviço por linha, com o valor dele (ou "Incluído" para o assinante). */
function ServiceItems({ items, planInfo }: { items: readonly Service[]; planInfo: SummaryPlanInfo }) {
  if (!items.length) return null;
  if (items.length === 1) return <>{items[0].name}</>;
  return (
    <span className="summary-list__items">
      {items.map((item) => (
        <span key={item.slug}>
          {item.name}
          <small>
            {planInfo.session ? getPriceLabel(item.price, planInfo.coverage[item.slug] ?? null) : formatCurrency(item.price)}
          </small>
        </span>
      ))}
    </span>
  );
}

function SummaryList({ draft, planInfo }: { draft: BookingDraft; planInfo: SummaryPlanInfo }) {
  const items = getServices(useBookingServices(), draft.serviceIds);
  const professionalLabel = getProfessionalLabel(draft, useBookingProfessionals());
  const professionalAvatarId =
    draft.professionalId === ANY_PROFESSIONAL ? draft.assignedProfessionalId : draft.professionalId;

  const { session } = planInfo;
  const plans = useBookingPlans();
  const rows = [
    ...(session
      ? [{ label: "Assinante", value: `${session.name.split(" ")[0]} · ${getPlan(plans, session.planId)?.shortName}` }]
      : []),
    {
      label: items.length > 1 ? "Serviços" : "Serviço",
      value: items.length ? <ServiceItems items={items} planInfo={planInfo} /> : null,
      key: `${draft.serviceIds.join()}:${Object.values(planInfo.coverage).map((item) => item?.reason).join()}`,
    },
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
    { label: "Duração", value: items.length ? formatDuration(sumServices(items).durationMinutes) : null },
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
  const total = getTotal(getServices(useBookingServices(), draft.serviceIds), planInfo);

  return (
    <aside aria-label="Resumo do atendimento" className="booking-summary">
      <p className="booking-summary__title">Seu atendimento</p>
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
  const items = getServices(useBookingServices(), draft.serviceIds);
  const meta = [items.length ? formatDuration(sumServices(items).durationMinutes) : null, getTotal(items, planInfo), draft.time]
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
          <span className="booking-bar__title">{items.length ? describeServices(items) : "Escolha um serviço"}</span>
          <span className="booking-bar__meta">{meta || "Resumo do atendimento"}</span>
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
