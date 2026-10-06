"use client";

import { useCallback, useMemo, useState } from "react";
import { CircleAlert } from "lucide-react";
import useAsyncData from "../../components/use-async-data";
import { bookingRules, getTodayIso } from "../../data/booking";
import {
  addDays,
  formatCurrency,
  formatFullDate,
  formatLongDate,
  getHistoryStart,
  getPayout,
  getServicePrice,
  getWeekday,
  summarizeByBarber,
  type Appointment,
} from "../../data/painel";
import { fetchAppointments, PainelApiError, updateAppointment as saveAppointment } from "../lib/painel-api";
import AppointmentsTable, { type AgendaFilters } from "./appointments-table";
import BarberProduction from "./barber-production";
import DateNav from "./date-nav";
import { isSubscriber } from "./membership-tag";

function getErrorMessage(error: unknown) {
  return error instanceof PainelApiError ? error.message : "Não foi possível falar com o banco. Tente novamente.";
}

/** Visão geral: a operação do dia (indicadores, produção da equipe e agenda). */
export default function AdminDashboard() {
  const today = getTodayIso();
  // Histórico de historyRules.months para trás; para frente, a mesma janela do agendamento online.
  const minDate = getHistoryStart(today);
  const maxDate = addDays(today, bookingRules.windowDays - 1);
  const [selectedDate, setSelectedDate] = useState(today);
  const [filters, setFilters] = useState<AgendaFilters>({
    barber: "todos",
    clientType: "todos",
    service: "todos",
  });
  // Edições feitas nesta tela, por cima do que veio do banco (some ao trocar de dia).
  const [edits, setEdits] = useState<{ loader: unknown; data: Appointment[] } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loader = useCallback(
    () => fetchAppointments({ start: selectedDate, end: selectedDate }),
    [selectedDate],
  );
  const loaded = useAsyncData(loader);
  const data = edits?.loader === loader ? edits.data : loaded.status === "success" ? loaded.data : null;

  const appointments = useMemo(() => data ?? [], [data]);
  const summaries = useMemo(() => summarizeByBarber(appointments), [appointments]);

  const active = appointments.filter((appointment) => appointment.status !== "cancelado");
  const completed = appointments.filter((appointment) => appointment.status === "concluido");
  const subscribers = active.filter((appointment) => isSubscriber(appointment.membership)).length;
  const walkInRevenue = completed.reduce((sum, appointment) => sum + getServicePrice(appointment), 0);
  const payout = completed.reduce((sum, appointment) => sum + getPayout(appointment), 0);

  function replaceAppointment(id: string, next: (item: Appointment) => Appointment) {
    setEdits((current) =>
      current ? { ...current, data: current.data.map((item) => (item.id === id ? next(item) : item)) } : current,
    );
  }

  async function updateAppointment(id: string, changes: Partial<Pick<Appointment, "status" | "performedBy">>) {
    const previous = appointments.find((appointment) => appointment.id === id);
    if (!data || !previous) return;
    setActionError(null);
    setEdits({ loader, data: data.map((item) => (item.id === id ? { ...item, ...changes } : item)) });

    try {
      const saved = await saveAppointment(id, changes);
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
          <p>Agenda e produção do dia. Histórico desde {formatFullDate(minDate)}.</p>
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
            <p className="admin-empty__title">Não foi possível carregar o painel</p>
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
            <dt>Horários marcados</dt>
            <dd>{active.length}</dd>
          </div>
          <div>
            <dt>Atendidos</dt>
            <dd>
              {completed.length}
              <span>de {active.length}</span>
            </dd>
          </div>
          <div>
            <dt>Assinantes · avulsos</dt>
            <dd>
              {subscribers}
              <span>· {active.length - subscribers}</span>
            </dd>
          </div>
          <div>
            <dt>Receita avulsa</dt>
            <dd>{formatCurrency(walkInRevenue)}</dd>
          </div>
          <div>
            <dt>A repassar à equipe</dt>
            <dd>{formatCurrency(payout)}</dd>
          </div>
        </dl>
      </div>

      <BarberProduction summaries={summaries} />

      <AppointmentsTable
        appointments={appointments}
        filters={filters}
        isClosed={getWeekday(selectedDate) === 0}
        onFiltersChange={setFilters}
        onUpdate={updateAppointment}
      />
    </main>
  );
}
