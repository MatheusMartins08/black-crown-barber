import { CalendarX2, CheckCircle2, Clock3, UserX, XCircle } from "lucide-react";
import {
  barberNames,
  formatCurrency,
  getClient,
  getMembership,
  getPlan,
  getSubscriptionOn,
  isCoveredByPlan,
  servicePrices,
  serviceNames,
  type Appointment,
  type AppointmentStatus,
  type BarberName,
  type PlanPayment,
  type ServiceName,
} from "../../data/painel";
import BarberAvatar from "./barber-avatar";
import MembershipTag, { isSubscriber } from "./membership-tag";

export type AgendaFilters = {
  barber: BarberName | "todos";
  clientType: "todos" | "assinante" | "pendente" | "avulso";
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
  payments: PlanPayment[];
};

export function matchesFilters(appointment: Appointment, filters: AgendaFilters, payments: PlanPayment[]) {
  if (filters.barber !== "todos" && appointment.performedBy !== filters.barber) return false;
  if (filters.service !== "todos" && appointment.serviceName !== filters.service) return false;
  if (filters.clientType === "todos") return true;

  const membership = getMembership(appointment.clientId, appointment.date, payments);
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
  payments,
}: AppointmentsTableProps) {
  const visible = appointments.filter((appointment) => matchesFilters(appointment, filters, payments));
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
                <AppointmentRow appointment={appointment} key={appointment.id} onUpdate={onUpdate} payments={payments} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Preço exibido na agenda: coberto, plano congelado, bloqueado por atraso, fora do plano ou avulso. */
function getPriceNote(appointment: Appointment, payments: PlanPayment[]) {
  const price = formatCurrency(servicePrices[appointment.serviceName]);
  const subscription = getSubscriptionOn(appointment.clientId, appointment.date);
  const plan = getPlan(subscription?.planId ?? null);

  if (isCoveredByPlan(appointment, payments)) return "Coberto pelo plano";
  if (!plan) return price;
  if (subscription?.status === "suspensa") return `Plano congelado · cobrar ${price}`;
  if (plan.covers.includes(appointment.serviceName)) return `Plano bloqueado por atraso · cobrar ${price}`;
  return `Fora do plano · ${price}`;
}

function AppointmentRow({
  appointment,
  onUpdate,
  payments,
}: {
  appointment: Appointment;
  onUpdate: AppointmentsTableProps["onUpdate"];
  payments: PlanPayment[];
}) {
  const client = getClient(appointment.clientId);
  const membership = getMembership(client.id, appointment.date, payments);
  const plan = getPlan(getSubscriptionOn(client.id, appointment.date)?.planId ?? null);
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
        <MembershipTag planName={plan?.name} status={membership} />
      </td>
      <td data-label="Serviço">
        <span className="admin-row__service">{appointment.serviceName}</span>
        <span className="admin-row__price">{getPriceNote(appointment, payments)}</span>
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
