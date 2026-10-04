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
import PrimaryActionButton, { type PrimaryAction } from "./primary-action-button";
import ProfessionalAvatar from "./professional-avatar";

function getProfessionalLabel(draft: BookingDraft) {
  if (!draft.professionalId) return null;
  const assignee = getProfessional(draft.assignedProfessionalId);
  if (draft.professionalId === ANY_PROFESSIONAL) return assignee ? assignee.name : "Qualquer profissional";
  return getProfessional(draft.professionalId)?.name ?? null;
}

function SummaryList({ draft }: { draft: BookingDraft }) {
  const service = getService(draft.serviceId);
  const professionalLabel = getProfessionalLabel(draft);
  const professionalAvatarId =
    draft.professionalId === ANY_PROFESSIONAL ? draft.assignedProfessionalId : draft.professionalId;

  const rows = [
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
    { label: "Duração", value: service?.duration },
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

export function BookingSummaryPanel({ draft }: { draft: BookingDraft }) {
  const service = getService(draft.serviceId);

  return (
    <aside aria-label="Resumo do agendamento" className="booking-summary">
      <p className="booking-summary__title">Seu agendamento</p>
      <SummaryList draft={draft} />
      <div className="booking-summary__total">
        <span>Total</span>
        <strong key={service?.price ?? "empty"}>{service ? formatCurrency(service.price) : "—"}</strong>
      </div>
      <p className="booking-summary__note">Valores demonstrativos.</p>
    </aside>
  );
}

export function BookingSummaryBar({ draft, action }: { draft: BookingDraft; action: PrimaryAction }) {
  const [isOpen, setIsOpen] = useState(false);
  const service = getService(draft.serviceId);
  const meta = [service?.duration, service ? formatCurrency(service.price) : null, draft.time].filter(Boolean).join(" · ");

  return (
    <div className={`booking-bar${isOpen ? " is-open" : ""}`}>
      <div className="booking-bar__panel" id="booking-bar-panel" inert={!isOpen}>
        <div className="booking-bar__panel-inner">
          <SummaryList draft={draft} />
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
