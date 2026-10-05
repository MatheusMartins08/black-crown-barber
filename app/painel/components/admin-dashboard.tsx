"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  dataRange,
  formatCurrency,
  formatLongDate,
  formatMonth,
  formatShortDate,
  getClient,
  getPayout,
  getPeriodRange,
  getServicePrice,
  getWeekday,
  initialAppointments,
  referenceDate,
  summarizeByBarber,
  type Appointment,
  type Period,
} from "../../data/painel";
import AppointmentsTable, { type AgendaFilters } from "./appointments-table";
import BarberProduction from "./barber-production";
import PayrollSummary from "./payroll-summary";
import PlansOverview from "./plans-overview";

function getPeriodLabel(date: string, period: Period) {
  if (period === "dia") return `Dia ${formatShortDate(date)}`;

  const range = getPeriodRange(date, period);
  if (period === "semana") return `Semana de ${formatShortDate(range.start)} a ${formatShortDate(range.end)}`;

  const month = formatMonth(date);
  return month.charAt(0).toUpperCase() + month.slice(1);
}

export default function AdminDashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [selectedDate, setSelectedDate] = useState(referenceDate);
  const [period, setPeriod] = useState<Period>("semana");
  const [filters, setFilters] = useState<AgendaFilters>({
    barber: "todos",
    clientType: "todos",
    service: "todos",
  });

  const dayAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.date === selectedDate),
    [appointments, selectedDate],
  );

  const periodAppointments = useMemo(() => {
    const range = getPeriodRange(selectedDate, period);
    return appointments.filter(
      (appointment) => appointment.date >= range.start && appointment.date <= range.end,
    );
  }, [appointments, selectedDate, period]);

  const daySummaries = useMemo(() => summarizeByBarber(dayAppointments), [dayAppointments]);
  const periodSummaries = useMemo(() => summarizeByBarber(periodAppointments), [periodAppointments]);
  const periodLabel = getPeriodLabel(selectedDate, period);

  const active = dayAppointments.filter((appointment) => appointment.status !== "cancelado");
  const completed = dayAppointments.filter((appointment) => appointment.status === "concluido");
  const subscribers = active.filter((appointment) => getClient(appointment.clientId).planId !== null).length;
  const walkInRevenue = completed.reduce((sum, appointment) => sum + getServicePrice(appointment), 0);
  const payout = completed.reduce((sum, appointment) => sum + getPayout(appointment), 0);

  const canGoBack = selectedDate > dataRange.start;
  const canGoForward = selectedDate < dataRange.end;

  function updateAppointment(id: string, changes: Partial<Pick<Appointment, "status" | "performedBy">>) {
    setAppointments((current) =>
      current.map((appointment) => (appointment.id === id ? { ...appointment, ...changes } : appointment)),
    );
  }

  function changeDate(date: string) {
    if (date >= dataRange.start && date <= dataRange.end) setSelectedDate(date);
  }

  return (
    <main className="admin-main">
      <div className="admin-toolbar">
        <div>
          <h1>{formatLongDate(selectedDate)}</h1>
          {/* Os dados vêm de app/data/painel.ts, gerados de forma determinística: ainda não há banco de dados conectado. */}
          <p>Visão do dia em {formatShortDate(selectedDate)}.</p>
        </div>

        <div className="admin-date-nav">
          <button
            aria-label="Dia anterior"
            className="admin-icon-button"
            disabled={!canGoBack}
            onClick={() => changeDate(addDays(selectedDate, -1))}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={18} />
          </button>
          <label className="admin-date-input">
            <span className="sr-only">Escolher data</span>
            <input
              max={dataRange.end}
              min={dataRange.start}
              onChange={(event) => changeDate(event.target.value)}
              type="date"
              value={selectedDate}
            />
          </label>
          <button
            aria-label="Próximo dia"
            className="admin-icon-button"
            disabled={!canGoForward}
            onClick={() => changeDate(addDays(selectedDate, 1))}
            type="button"
          >
            <ChevronRight aria-hidden="true" size={18} />
          </button>
          <button
            className="admin-text-button"
            disabled={selectedDate === referenceDate}
            onClick={() => setSelectedDate(referenceDate)}
            type="button"
          >
            Hoje
          </button>
        </div>
      </div>

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

      <BarberProduction summaries={daySummaries} />

      <AppointmentsTable
        appointments={dayAppointments}
        filters={filters}
        isClosed={getWeekday(selectedDate) === 0}
        onFiltersChange={setFilters}
        onUpdate={updateAppointment}
      />

      <PayrollSummary
        onPeriodChange={setPeriod}
        period={period}
        periodLabel={periodLabel}
        summaries={periodSummaries}
      />

      <PlansOverview appointments={periodAppointments} periodLabel={periodLabel} />
    </main>
  );
}
