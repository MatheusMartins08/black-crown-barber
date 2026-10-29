"use client";

import { useCallback, useMemo, useState } from "react";
import { CircleAlert, CircleCheck, Plus } from "lucide-react";
import useAsyncData from "../../components/use-async-data";
import { bookingRules } from "../../data/booking";
import { getDayPeriods } from "../../data/hours";
import {
  addDays,
  formatCurrency,
  formatFullDate,
  formatLongDate,
  getHistoryStart,
  getPayout,
  getServicePrice,
  listServicesFor,
  summarizeByBarber,
  type Appointment,
} from "../../data/painel";
import { hasActivePlans } from "../../data/plans";
import { fetchAppointments, PainelApiError, updateAppointment as saveAppointment } from "../lib/painel-api";
import { NewAppointmentDialog, RescheduleDialog } from "./appointment-dialogs";
import AppointmentsTable, { useAdminPriceNote, type AgendaFilters } from "./appointments-table";
import BarberProduction from "./barber-production";
import DateNav from "./date-nav";
import { isSubscriber } from "./membership-tag";
import {
  findProfessional,
  usePainelPlans,
  usePainelProfessionals,
  usePainelSchedule,
  usePainelServices,
  usePainelToday,
} from "./painel-catalog";

function getErrorMessage(error: unknown) {
  return error instanceof PainelApiError ? error.message : "Não foi possível falar com o banco. Tente novamente.";
}

/** Visão geral: a operação do dia (indicadores, produção da equipe e agenda). */
export default function AdminDashboard() {
  const today = usePainelToday();
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
  // Aviso depois de marcar ou remarcar; com `date`, oferece ir ao dia (outro que não o aberto).
  const [notice, setNotice] = useState<{ message: string; date: string | null } | null>(null);
  const [dialog, setDialog] = useState<{ type: "new" } | { type: "reschedule"; appointment: Appointment } | null>(null);
  // O último remarcado continua no diálogo enquanto ele fecha.
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [dialogKey, setDialogKey] = useState(0);

  const loader = useCallback(
    () => fetchAppointments({ start: selectedDate, end: selectedDate }),
    [selectedDate],
  );
  const loaded = useAsyncData(loader);
  const data = edits?.loader === loader ? edits.data : loaded.status === "success" ? loaded.data : null;

  const professionals = usePainelProfessionals();
  const services = usePainelServices();
  const schedule = usePainelSchedule();
  // Sem nenhum plano ativo, os indicadores de assinatura saem da tela (voltam ao reativar um plano).
  const showPlans = hasActivePlans(usePainelPlans());
  const priceNote = useAdminPriceNote();
  const appointments = useMemo(() => data ?? [], [data]);
  const serviceColumns = useMemo(() => listServicesFor(services, appointments), [services, appointments]);
  const summaries = useMemo(
    () => summarizeByBarber(appointments, professionals, services),
    [appointments, professionals, services],
  );

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

  function openDialog(next: NonNullable<typeof dialog>) {
    setDialogKey((key) => key + 1);
    if (next.type === "reschedule") setRescheduling(next.appointment);
    setDialog(next);
  }

  /** Coloca (ou tira) o atendimento salvo na agenda aberta, em ordem de horário. */
  function placeAppointment(saved: Appointment) {
    if (!data) return;
    const others = data.filter((item) => item.id !== saved.id);
    const next = saved.date === selectedDate ? [...others, saved].sort((a, b) => a.time.localeCompare(b.time)) : others;
    setEdits({ loader, data: next });
  }

  function onCreated(created: Appointment) {
    setDialog(null);
    setActionError(null);
    placeAppointment(created);
    const when = `${formatFullDate(created.date)} às ${created.time}`;
    setNotice({
      message: `Horário marcado para ${created.clientName}: ${when}, com ${created.bookedWith}. Código ${created.code}.`,
      date: created.date === selectedDate ? null : created.date,
    });
  }

  function onRescheduled(saved: Appointment) {
    setDialog(null);
    setActionError(null);
    placeAppointment(saved);
    setNotice({
      message: `${saved.clientName} remarcado para ${formatFullDate(saved.date)} às ${saved.time}, com ${saved.bookedWith}.`,
      date: saved.date === selectedDate ? null : saved.date,
    });
  }

  async function updateAppointment(id: string, changes: Partial<Pick<Appointment, "status" | "performedById">>) {
    const previous = appointments.find((appointment) => appointment.id === id);
    if (!data || !previous) return;
    setActionError(null);
    // Mostra a troca na hora (com o nome do novo executor) enquanto o banco grava.
    const performer = changes.performedById ? findProfessional(professionals, changes.performedById) : null;
    const optimistic = { ...changes, ...(performer ? { performedBy: performer.name } : {}) };
    setEdits({ loader, data: data.map((item) => (item.id === id ? { ...item, ...optimistic } : item)) });

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

      {notice ? (
        <div className="admin-alert admin-alert--success" role="status">
          <CircleCheck aria-hidden="true" size={16} />
          <span>{notice.message}</span>
          {notice.date ? (
            <button
              className="admin-text-button"
              onClick={() => {
                setSelectedDate(notice.date!);
                setNotice(null);
              }}
              type="button"
            >
              Ver o dia
            </button>
          ) : null}
          <button className="admin-text-button" onClick={() => setNotice(null)} type="button">
            Fechar
          </button>
        </div>
      ) : null}

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
        <dl className={`admin-kpis${showPlans ? "" : " admin-kpis--four"}`} aria-label="Resumo do dia">
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
          {showPlans ? (
            <div>
              <dt>Assinantes · avulsos</dt>
              <dd>
                {subscribers}
                <span>· {active.length - subscribers}</span>
              </dd>
            </div>
          ) : null}
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

      <BarberProduction services={serviceColumns} showPlanSplit={showPlans} summaries={summaries} />

      <AppointmentsTable
        appointments={appointments}
        filters={filters}
        // Fechado sem nenhum horário marcado. Se houver agendamentos (ex.: exceção criada depois,
        // com conflito confirmado), a agenda continua aparecendo para a equipe resolver.
        isClosed={
          appointments.length === 0 && getDayPeriods(selectedDate, schedule.periods, schedule.exceptions).length === 0
        }
        headingAction={
          <button
            className="button button--compact admin-action"
            disabled={!data}
            onClick={() => openDialog({ type: "new" })}
            type="button"
          >
            <Plus aria-hidden="true" size={15} />
            Novo horário
          </button>
        }
        onFiltersChange={setFilters}
        onReschedule={(appointment) => openDialog({ type: "reschedule", appointment })}
        onUpdate={updateAppointment}
        priceNote={priceNote}
      />

      <NewAppointmentDialog
        defaultDate={selectedDate < today ? today : selectedDate}
        onClose={() => setDialog(null)}
        onSaved={onCreated}
        open={dialog?.type === "new"}
        openKey={dialogKey}
        range={{ minDate: today, maxDate }}
      />
      <RescheduleDialog
        appointment={rescheduling}
        onClose={() => setDialog(null)}
        onSaved={onRescheduled}
        open={dialog?.type === "reschedule"}
        openKey={dialogKey}
        range={{ minDate: today, maxDate }}
      />
    </main>
  );
}
