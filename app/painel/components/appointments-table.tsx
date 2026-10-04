import { CalendarX2, CheckCircle2, Clock3, UserX, XCircle } from "lucide-react";
import {
  barberNames,
  formatCurrency,
  getClient,
  getPlan,
  isCoveredByPlan,
  servicePrices,
  serviceNames,
  type Appointment,
  type AppointmentStatus,
  type BarberName,
  type ServiceName,
} from "../../data/painel";
import BarberAvatar from "./barber-avatar";

export type AgendaFilters = {
  barber: BarberName | "todos";
  clientType: "todos" | "assinante" | "avulso";
  service: ServiceName | "todos";
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
  onUpdate: (id: string, changes: Partial<Pick<Appointment, "status" | "performedBy">>) => void;
};

export function matchesFilters(appointment: Appointment, filters: AgendaFilters) {
  if (filters.barber !== "todos" && appointment.performedBy !== filters.barber) return false;
  if (filters.service !== "todos" && appointment.serviceName !== filters.service) return false;
  if (filters.clientType === "todos") return true;

  const isSubscriber = getClient(appointment.clientId).planId !== null;
  return filters.clientType === "assinante" ? isSubscriber : !isSubscriber;
}

const defaultFilters: AgendaFilters = { barber: "todos", clientType: "todos", service: "todos" };

export default function AppointmentsTable({
  appointments,
  filters,
  isClosed,
  onFiltersChange,
  onUpdate,
}: AppointmentsTableProps) {
  const visible = appointments.filter((appointment) => matchesFilters(appointment, filters));
  const hasFilters =
    filters.barber !== "todos" || filters.clientType !== "todos" || filters.service !== "todos";

  return (
    <section aria-labelledby="agenda-title" className="admin-panel admin-agenda" id="agenda">
      <div className="admin-panel__heading">
        <div>
          <h2 id="agenda-title">Agenda do dia</h2>
          <p>
            {visible.length} de {appointments.length} horários. Altere quem executou e o status ao
            longo do dia.
          </p>
        </div>
      </div>

      <div className="admin-filters" role="group" aria-label="Filtrar agenda">
        <label className="admin-field">
          <span>Profissional</span>
          <select
            onChange={(event) =>
              onFiltersChange({ ...filters, barber: event.target.value as AgendaFilters["barber"] })
            }
            value={filters.barber}
          >
            <option value="todos">Todos</option>
            {barberNames.map((name) => (
              <option key={name} value={name}>
                {name}
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
            {serviceNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {hasFilters ? (
          <button className="admin-text-button" onClick={() => onFiltersChange(defaultFilters)} type="button">
            Limpar filtros
          </button>
        ) : null}
      </div>

      {isClosed ? (
        <div className="admin-empty">
          <CalendarX2 aria-hidden="true" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">Barbearia fechada aos domingos</p>
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
                <AppointmentRow appointment={appointment} key={appointment.id} onUpdate={onUpdate} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AppointmentRow({
  appointment,
  onUpdate,
}: {
  appointment: Appointment;
  onUpdate: AppointmentsTableProps["onUpdate"];
}) {
  const client = getClient(appointment.clientId);
  const plan = getPlan(client.planId);
  const covered = isCoveredByPlan(appointment);
  const status = statusOptions.find((option) => option.value === appointment.status)!;
  const StatusIcon = status.icon;
  const reassigned = appointment.performedBy !== appointment.bookedWith;

  return (
    <tr className={`admin-row admin-row--${appointment.status}`}>
      <td className="admin-row__time" data-label="Horário">
        {appointment.time}
      </td>
      <td data-label="Cliente">
        <span className="admin-row__client">{client.name}</span>
        {plan ? (
          <span className="admin-tag admin-tag--plan">Assinante · {plan.name}</span>
        ) : (
          <span className="admin-tag admin-tag--walkin">Avulso</span>
        )}
      </td>
      <td data-label="Serviço">
        <span className="admin-row__service">{appointment.serviceName}</span>
        <span className="admin-row__price">
          {covered
            ? "Coberto pelo plano"
            : plan
              ? `Fora do plano · ${formatCurrency(servicePrices[appointment.serviceName])}`
              : formatCurrency(servicePrices[appointment.serviceName])}
        </span>
      </td>
      <td data-label="Marcado com">
        <span className="admin-person">
          <BarberAvatar name={appointment.bookedWith} />
          {appointment.bookedWith}
        </span>
      </td>
      <td data-label="Executado por">
        <label className="admin-inline-select">
          <span className="sr-only">Profissional que executou o atendimento das {appointment.time}</span>
          <select
            onChange={(event) =>
              onUpdate(appointment.id, { performedBy: event.target.value as BarberName })
            }
            value={appointment.performedBy}
          >
            {barberNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {reassigned ? <span className="admin-row__note">Trocado na agenda</span> : null}
      </td>
      <td data-label="Status">
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
