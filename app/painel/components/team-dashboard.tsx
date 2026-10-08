"use client";

import { useCallback, useMemo, useState } from "react";
import { CircleAlert } from "lucide-react";
import useAsyncData from "../../components/use-async-data";
import { bookingRules, getTodayIso } from "../../data/booking";
import { getDayPeriods } from "../../data/hours";
import {
  addDays,
  formatFullDate,
  formatLongDate,
  getHistoryStart,
  listServicesFor,
  summarizeTeam,
  type AgendaAppointment,
} from "../../data/painel";
import { fetchTeamAgenda, PainelApiError, updateTeamAppointment } from "../lib/painel-api";
import AppointmentsTable, { type AgendaFilters } from "./appointments-table";
import BarberProduction from "./barber-production";
import DateNav from "./date-nav";
import { findProfessional, usePainelProfessionals, usePainelSchedule, usePainelServices } from "./painel-catalog";

function getErrorMessage(error: unknown) {
  return error instanceof PainelApiError ? error.message : "Não foi possível falar com o banco. Tente novamente.";
}

/**
 * Visão geral do painel dos barbeiros: a agenda do dia de toda a equipe, para se organizarem e
 * se ajudarem. Só operação: nenhum valor, repasse ou situação de pagamento (o banco nem envia).
 * Status e executor só podem ser alterados nos horários do próprio barbeiro.
 */
export default function TeamDashboard({ professionalId }: { professionalId: string | null }) {
  const today = getTodayIso();
  const minDate = getHistoryStart(today);
  const maxDate = addDays(today, bookingRules.windowDays - 1);
  const [selectedDate, setSelectedDate] = useState(today);
  const [filters, setFilters] = useState<AgendaFilters>({ barber: "todos", clientType: "todos", service: "todos" });
  // Edições feitas nesta tela, por cima do que veio do banco (some ao trocar de dia).
  const [edits, setEdits] = useState<{ loader: unknown; data: AgendaAppointment[] } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loader = useCallback(() => fetchTeamAgenda({ start: selectedDate, end: selectedDate }), [selectedDate]);
  const loaded = useAsyncData(loader);
  const data = edits?.loader === loader ? edits.data : loaded.status === "success" ? loaded.data : null;

  const professionals = usePainelProfessionals();
  const services = usePainelServices();
  const schedule = usePainelSchedule();
  const appointments = useMemo(() => data ?? [], [data]);
  const serviceColumns = useMemo(() => listServicesFor(services, appointments), [services, appointments]);
  const summaries = useMemo(
    () => summarizeTeam(appointments, professionals, services),
    [appointments, professionals, services],
  );

  const count = (status: AgendaAppointment["status"]) =>
    appointments.filter((appointment) => appointment.status === status).length;
  const isMine = (appointment: AgendaAppointment) =>
    professionalId !== null &&
    (appointment.performedById === professionalId || appointment.bookedWithId === professionalId);

  function replaceAppointment(id: string, next: (item: AgendaAppointment) => AgendaAppointment) {
    setEdits((current) =>
      current ? { ...current, data: current.data.map((item) => (item.id === id ? next(item) : item)) } : current,
    );
  }

  async function updateAppointment(id: string, changes: Partial<Pick<AgendaAppointment, "status" | "performedById">>) {
    const previous = appointments.find((appointment) => appointment.id === id);
    if (!data || !previous) return;
    setActionError(null);
    const performer = changes.performedById ? findProfessional(professionals, changes.performedById) : null;
    const optimistic = { ...changes, ...(performer ? { performedBy: performer.name } : {}) };
    setEdits({ loader, data: data.map((item) => (item.id === id ? { ...item, ...optimistic } : item)) });

    try {
      const saved = await updateTeamAppointment(id, changes);
      replaceAppointment(id, () => saved);
    } catch (error) {
      replaceAppointment(id, () => previous);
      setActionError(getErrorMessage(error));
    }
  }

  return (
    <main className="admin-main">
      <div className="admin-toolbar">
        <div>
          <h1>{formatLongDate(selectedDate)}</h1>
          <p>Agenda de toda a equipe. Histórico desde {formatFullDate(minDate)}.</p>
        </div>

        <DateNav max={maxDate} min={minDate} onChange={setSelectedDate} today={today} value={selectedDate} />
      </div>

      {actionError ? (
        <div className="admin-alert" role="alert">
          <CircleAlert aria-hidden="true" size={16} />
          <span>{actionError}</span>
          <button className="admin-text-button" onClick={() => setActionError(null)} type="button">
            Fechar
          </button>
        </div>
      ) : null}

      {loaded.status === "error" && !data ? (
        <div className="admin-panel">
          <div className="admin-empty">
            <CircleAlert aria-hidden="true" size={22} strokeWidth={1.6} />
            <p className="admin-empty__title">Não foi possível carregar a agenda</p>
            <p>{getErrorMessage(loaded.error)}</p>
            <button className="admin-text-button" onClick={loaded.retry} type="button">
              Tentar de novo
            </button>
          </div>
        </div>
      ) : null}

      <div aria-busy={!data} className={data ? undefined : "admin-loading"}>
        <dl className="admin-kpis" aria-label="Resumo do dia">
          <div>
            <dt>Agendamentos</dt>
            <dd>{appointments.length}</dd>
          </div>
          <div>
            <dt>Atendidos</dt>
            <dd>{count("concluido")}</dd>
          </div>
          <div>
            <dt>Pendentes</dt>
            <dd>{count("agendado")}</dd>
          </div>
          <div>
            <dt>Faltas</dt>
            <dd>{count("faltou")}</dd>
          </div>
          <div>
            <dt>Cancelados</dt>
            <dd>{count("cancelado")}</dd>
          </div>
        </dl>
      </div>

      <BarberProduction services={serviceColumns} summaries={summaries} />

      <AppointmentsTable
        appointments={appointments}
        canEdit={isMine}
        filters={filters}
        isClosed={
          appointments.length === 0 && getDayPeriods(selectedDate, schedule.periods, schedule.exceptions).length === 0
        }
        onFiltersChange={setFilters}
        onUpdate={updateAppointment}
        paymentFilter={false}
      />
    </main>
  );
}
