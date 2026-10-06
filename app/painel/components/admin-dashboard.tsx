"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CircleAlert } from "lucide-react";
import useAsyncData from "../../components/use-async-data";
import { getTodayIso } from "../../data/booking";
import {
  addDays,
  formatCurrency,
  formatLongDate,
  formatMonth,
  formatShortDate,
  getPayout,
  getPeriodRange,
  getServicePrice,
  getWeekday,
  summarizeByBarber,
  type Appointment,
  type ClientProfile,
  type MonthPayment,
  type PaymentMethod,
  type Period,
} from "../../data/painel";
import {
  fetchAppointments,
  fetchClientProfiles,
  fetchMonthPayments,
  PainelApiError,
  registerPayment as savePayment,
  updateAppointment as saveAppointment,
} from "../lib/painel-api";
import AppointmentsTable, { type AgendaFilters } from "./appointments-table";
import BarberProduction from "./barber-production";
import ClientsOverview from "./clients-overview";
import { isSubscriber } from "./membership-tag";
import PayrollSummary from "./payroll-summary";
import PlansOverview from "./plans-overview";
import SubscribersOverview from "./subscribers-overview";

function getPeriodLabel(date: string, period: Period) {
  if (period === "dia") return `Dia ${formatShortDate(date)}`;

  const range = getPeriodRange(date, period);
  if (period === "semana") return `Semana de ${formatShortDate(range.start)} a ${formatShortDate(range.end)}`;

  const month = formatMonth(date);
  return month.charAt(0).toUpperCase() + month.slice(1);
}

type DashboardData = {
  appointments: Appointment[];
  profiles: ClientProfile[];
  monthPayments: MonthPayment[];
};

function getErrorMessage(error: unknown) {
  return error instanceof PainelApiError ? error.message : "Não foi possível falar com o banco. Tente novamente.";
}

export default function AdminDashboard() {
  const today = getTodayIso();
  const [selectedDate, setSelectedDate] = useState(today);
  const [period, setPeriod] = useState<Period>("semana");
  const [filters, setFilters] = useState<AgendaFilters>({
    barber: "todos",
    clientType: "todos",
    service: "todos",
  });
  // Edições feitas nesta tela, por cima do que veio do banco (some ao recarregar os dados).
  const [edits, setEdits] = useState<{ loader: unknown; data: DashboardData } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Carrega o maior intervalo em uso: o período do fechamento já contém o dia selecionado.
  const { start, end } = getPeriodRange(selectedDate, period);
  const month = selectedDate.slice(0, 7);
  const loader = useCallback(async (): Promise<DashboardData> => {
    const [appointments, profiles, monthPayments] = await Promise.all([
      fetchAppointments({ start, end }),
      fetchClientProfiles(),
      fetchMonthPayments(month),
    ]);
    return { appointments, profiles, monthPayments };
  }, [start, end, month]);
  const loaded = useAsyncData(loader);
  const data = edits?.loader === loader ? edits.data : loaded.status === "success" ? loaded.data : null;

  const appointments = useMemo(() => data?.appointments ?? [], [data]);
  const dayAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.date === selectedDate),
    [appointments, selectedDate],
  );
  const daySummaries = useMemo(() => summarizeByBarber(dayAppointments), [dayAppointments]);
  const periodSummaries = useMemo(() => summarizeByBarber(appointments), [appointments]);
  const periodLabel = getPeriodLabel(selectedDate, period);

  const active = dayAppointments.filter((appointment) => appointment.status !== "cancelado");
  const completed = dayAppointments.filter((appointment) => appointment.status === "concluido");
  const subscribers = active.filter((appointment) => isSubscriber(appointment.membership)).length;
  const walkInRevenue = completed.reduce((sum, appointment) => sum + getServicePrice(appointment), 0);
  const payout = completed.reduce((sum, appointment) => sum + getPayout(appointment), 0);

  function applyEdit(change: (current: DashboardData) => DashboardData) {
    if (!data) return;
    setEdits({ loader, data: change(data) });
  }

  async function updateAppointment(id: string, changes: Partial<Pick<Appointment, "status" | "performedBy">>) {
    const previous = appointments.find((appointment) => appointment.id === id);
    if (!previous) return;
    setActionError(null);
    applyEdit((current) => ({
      ...current,
      appointments: current.appointments.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    }));

    try {
      const saved = await saveAppointment(id, changes);
      setEdits((current) =>
        current
          ? {
              ...current,
              data: {
                ...current.data,
                appointments: current.data.appointments.map((item) => (item.id === id ? saved : item)),
              },
            }
          : current,
      );
    } catch (error) {
      setEdits((current) =>
        current
          ? {
              ...current,
              data: {
                ...current.data,
                appointments: current.data.appointments.map((item) => (item.id === id ? previous : item)),
              },
            }
          : current,
      );
      setActionError(getErrorMessage(error));
    }
  }

  // Registro manual (Pix, cartão ou dinheiro). Depois de gravar, recarrega clientes e
  // mensalidades: a situação do cliente e a cobertura dos horários podem mudar.
  async function registerPayment(id: string, method: PaymentMethod) {
    setActionError(null);
    try {
      await savePayment(id, method);
      setEdits(null);
      loaded.retry();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  function changeDate(date: string) {
    if (date) setSelectedDate(date);
  }

  return (
    <main className="admin-main">
      <div className="admin-toolbar">
        <div>
          <h1>{formatLongDate(selectedDate)}</h1>
          <p>Visão do dia em {formatShortDate(selectedDate)}.</p>
        </div>

        <div className="admin-date-nav">
          <button
            aria-label="Dia anterior"
            className="admin-icon-button"
            onClick={() => changeDate(addDays(selectedDate, -1))}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={18} />
          </button>
          <label className="admin-date-input">
            <span className="sr-only">Escolher data</span>
            <input onChange={(event) => changeDate(event.target.value)} type="date" value={selectedDate} />
          </label>
          <button
            aria-label="Próximo dia"
            className="admin-icon-button"
            onClick={() => changeDate(addDays(selectedDate, 1))}
            type="button"
          >
            <ChevronRight aria-hidden="true" size={18} />
          </button>
          <button
            className="admin-text-button"
            disabled={selectedDate === today}
            onClick={() => setSelectedDate(today)}
            type="button"
          >
            Hoje
          </button>
        </div>
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

      <BarberProduction summaries={daySummaries} />

      <AppointmentsTable
        appointments={dayAppointments}
        filters={filters}
        isClosed={getWeekday(selectedDate) === 0}
        onFiltersChange={setFilters}
        onUpdate={updateAppointment}
      />

      <ClientsOverview date={today} onRegisterPayment={registerPayment} profiles={data?.profiles ?? []} />

      <SubscribersOverview />

      <PayrollSummary
        onPeriodChange={setPeriod}
        period={period}
        periodLabel={periodLabel}
        summaries={periodSummaries}
      />

      <PlansOverview
        appointments={appointments}
        date={selectedDate}
        monthPayments={data?.monthPayments ?? []}
        periodLabel={periodLabel}
        profiles={data?.profiles ?? []}
      />
    </main>
  );
}
