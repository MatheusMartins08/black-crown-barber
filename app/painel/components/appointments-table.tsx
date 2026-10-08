"use client";

import { useState } from "react";
import { CalendarX2, CheckCircle2, Clock3, UserX, XCircle } from "lucide-react";
import {
  formatCurrency,
  getAppointmentItems,
  getPlanByName,
  getServicePrice,
  hasService,
  isCoveredByPlan,
  listProfessionalsFor,
  listServicesFor,
  type Appointment,
  type AppointmentStatus,
} from "../../data/painel";
import type { SubscriptionPlan } from "../../data/plans";
import { getFirstName, type Professional } from "../../data/professionals";
import { formatDuration } from "../../data/services";
import BarberAvatar from "./barber-avatar";
import FilterToggle from "./filter-toggle";
import MembershipTag, { isSubscriber } from "./membership-tag";
import { usePainelPlans, usePainelProfessionals, usePainelServices } from "./painel-catalog";

export type AgendaFilters = {
  /** Id do profissional (uuid) ou "todos". */
  barber: string | "todos";
  clientType: "todos" | "assinante" | "pendente" | "avulso";
  /** Id do serviço (uuid) ou "todos". */
  service: string | "todos";
};

export const statusOptions: { value: AppointmentStatus; label: string; icon: typeof Clock3 }[] = [
  { value: "agendado", label: "Agendado", icon: Clock3 },
  { value: "concluido", label: "Concluído", icon: CheckCircle2 },
  { value: "faltou", label: "Faltou", icon: UserX },
  { value: "cancelado", label: "Cancelado", icon: XCircle },
];

type AppointmentsTableProps = {
  appointments: Appointment[];
  filters: AgendaFilters;
  isClosed: boolean;
  onFiltersChange: (filters: AgendaFilters) => void;
  onUpdate: (id: string, changes: Partial<Pick<Appointment, "status" | "performedById">>) => void;
};

export function matchesFilters(appointment: Appointment, filters: AgendaFilters) {
  if (filters.barber !== "todos" && appointment.performedById !== filters.barber) return false;
  // Um atendimento com vários serviços aparece no filtro de qualquer um deles.
  if (filters.service !== "todos" && !hasService(appointment, filters.service)) return false;
  if (filters.clientType === "todos") return true;

  const membership = appointment.membership;
  if (filters.clientType === "pendente") return membership === "pendente" || membership === "atrasado";
  return filters.clientType === "assinante" ? isSubscriber(membership) : !isSubscriber(membership);
}

const defaultFilters: AgendaFilters = { barber: "todos", clientType: "todos", service: "todos" };

export default function AppointmentsTable({
  appointments,
  filters,
  isClosed,
  onFiltersChange,
  onUpdate,
}: AppointmentsTableProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const professionals = usePainelProfessionals();
  // Ativos e quem aparece no dia (um inativo com atendimento continua filtrável).
  const listed = listProfessionalsFor(professionals, appointments);
  const active = professionals.filter((professional) => professional.isActive);
  const services = listServicesFor(usePainelServices(), appointments);
  const visible = appointments.filter((appointment) => matchesFilters(appointment, filters));
  const activeFilters = [filters.barber, filters.clientType, filters.service].filter((value) => value !== "todos").length;

  return (
    <section aria-labelledby="agenda-title" className="admin-panel admin-agenda" id="agenda">
      <div className="admin-panel__heading admin-panel__heading--action">
        <div>
          <h2 id="agenda-title">Agenda do dia</h2>
          <p>
            {visible.length} de {appointments.length} horários.
            <span className="admin-hide-mobile">
              {" "}
              Altere quem executou e o status ao longo do dia.
            </span>
          </p>
        </div>
        <FilterToggle
          activeCount={activeFilters}
          controls="agenda-filters"
          onToggle={() => setFiltersOpen((current) => !current)}
          open={filtersOpen}
        />
      </div>

      <div
        aria-label="Filtrar agenda"
        className={`admin-filters admin-filters--collapsible${filtersOpen ? " is-open" : ""}`}
        id="agenda-filters"
        role="group"
      >
        <label className="admin-field">
          <span>Profissional</span>
          <select
            onChange={(event) =>
              onFiltersChange({ ...filters, barber: event.target.value as AgendaFilters["barber"] })
            }
            value={filters.barber}
          >
            <option value="todos">Todos</option>
            {listed.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.name}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>Cliente</span>
          <select
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                clientType: event.target.value as AgendaFilters["clientType"],
              })
            }
            value={filters.clientType}
          >
            <option value="todos">Todos</option>
            <option value="assinante">Assinantes</option>
            <option value="pendente">Pagamento pendente</option>
            <option value="avulso">Avulsos</option>
          </select>
        </label>
        <label className="admin-field">
          <span>Serviço</span>
          <select
            onChange={(event) =>
              onFiltersChange({ ...filters, service: event.target.value as AgendaFilters["service"] })
            }
            value={filters.service}
          >
            <option value="todos">Todos</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </label>
        {activeFilters ? (
          <button className="admin-text-button" onClick={() => onFiltersChange(defaultFilters)} type="button">
            Limpar filtros
          </button>
        ) : null}
      </div>

      {isClosed ? (
        <div className="admin-empty">
          <CalendarX2 aria-hidden="true" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">Barbearia fechada neste dia</p>
          <p>Escolha outro dia para ver a agenda e a produção da equipe.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="admin-empty">
          <CalendarX2 aria-hidden="true" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">Nenhum horário com esses filtros</p>
          <p>Ajuste o profissional, o tipo de cliente ou o serviço.</p>
          <button className="admin-text-button" onClick={() => onFiltersChange(defaultFilters)} type="button">
            Limpar filtros
          </button>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--agenda">
            <thead>
              <tr>
                <th scope="col">Horário</th>
                <th scope="col">Cliente</th>
                <th scope="col">Serviço</th>
                <th scope="col">Marcado com</th>
                <th scope="col">Executado por</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((appointment) => (
                <AppointmentRow
                  activeProfessionals={active}
                  appointment={appointment}
                  key={appointment.id}
                  onUpdate={onUpdate}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Preço exibido na agenda: coberto, plano congelado, bloqueado por atraso, limite do período,
 * fora do plano ou avulso. Com vários serviços, o plano cobre serviço a serviço e o valor a
 * cobrar é a soma dos que ficaram fora.
 */
function getPriceNote(appointment: Appointment, plans: readonly SubscriptionPlan[]) {
  const items = getAppointmentItems(appointment);
  const price = formatCurrency(getServicePrice(appointment));
  const plan = getPlanByName(plans, appointment.planName);
  const uncovered = items.filter((item) => !item.covered);

  if (isCoveredByPlan(appointment)) return "Coberto pelo plano";
  if (!appointment.planName) return price;
  if (appointment.membership === "congelado") return `Plano congelado · cobrar ${price}`;
  if (appointment.membership === "atrasado") return `Plano bloqueado por atraso · cobrar ${price}`;
  if (uncovered.length < items.length) {
    return `Plano cobre ${items.filter((item) => item.covered).map((item) => item.serviceName).join(" + ")} · cobrar ${price}`;
  }
  if (plan?.benefits.some((benefit) => uncovered.some((item) => item.serviceSlug === benefit.serviceId))) {
    return `Limite do plano já usado · cobrar ${price}`;
  }
  return `Fora do plano · ${price}`;
}

function AppointmentRow({
  activeProfessionals,
  appointment,
  onUpdate,
}: {
  activeProfessionals: readonly Professional[];
  appointment: Appointment;
  onUpdate: AppointmentsTableProps["onUpdate"];
}) {
  const status = statusOptions.find((option) => option.value === appointment.status)!;
  const StatusIcon = status.icon;
  const reassigned = appointment.performedById !== appointment.bookedWithId;
  const plans = usePainelPlans();
  // Só profissionais ativos recebem atendimentos; o atual fica na lista mesmo se inativo.
  const performerOptions = activeProfessionals.some((professional) => professional.id === appointment.performedById)
    ? activeProfessionals
    : [{ id: appointment.performedById, name: appointment.performedBy }, ...activeProfessionals];

  return (
    <tr className={`admin-row admin-row--${appointment.status}`}>
      <td className="admin-row__time" data-label="Horário">
        {appointment.time}
      </td>
      <td className="admin-row__who" data-label="Cliente">
        <span className="admin-row__client">{appointment.clientName}</span>
        <MembershipTag planName={appointment.planName ?? undefined} status={appointment.membership} />
      </td>
      <td className="admin-row__what" data-label="Serviço">
        <span className="admin-row__service">{appointment.serviceName}</span>
        <span className="admin-row__price">
          {appointment.items.length > 1 ? `${formatDuration(appointment.durationMinutes)} · ` : null}
          {getPriceNote(appointment, plans)}
        </span>
      </td>
      <td className="admin-row__booked" data-label="Marcado com">
        <span className="admin-person">
          <BarberAvatar professionalId={appointment.bookedWithId} />
          {appointment.bookedWith}
        </span>
      </td>
      <td className="admin-row__performed" data-label="Executado por">
        <label className="admin-inline-select admin-person-select">
          <BarberAvatar professionalId={appointment.performedById} size={20} />
          <span className="sr-only">Profissional que executou o atendimento das {appointment.time}</span>
          <select
            onChange={(event) =>
              onUpdate(appointment.id, { performedById: event.target.value })
            }
            value={appointment.performedById}
          >
            {/* Primeiro nome: cabe ao lado do status no celular (a foto identifica). */}
            {performerOptions.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {getFirstName(professional.name)}
              </option>
            ))}
          </select>
        </label>
        {/* Até 960px a coluna "Marcado com" some: a troca diz com quem foi marcado. */}
        {reassigned ? (
          <span className="admin-row__note">
            <span className="admin-hide-compact">Trocado na agenda</span>
            <span className="admin-show-compact">Marcado com {appointment.bookedWith}</span>
          </span>
        ) : null}
      </td>
      <td className="admin-row__state" data-label="Status">
        <label className={`admin-status admin-status--${appointment.status}`}>
          <StatusIcon aria-hidden="true" size={15} strokeWidth={1.8} />
          <span className="sr-only">Status do atendimento das {appointment.time}</span>
          <select
            onChange={(event) =>
              onUpdate(appointment.id, { status: event.target.value as AppointmentStatus })
            }
            value={appointment.status}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </td>
    </tr>
  );
}
