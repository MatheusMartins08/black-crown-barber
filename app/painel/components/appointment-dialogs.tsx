"use client";

import { useCallback, useId, useMemo, useState, type FormEvent } from "react";
import { CircleAlert } from "lucide-react";
import useAsyncData from "../../components/use-async-data";
import Dialog from "../../components/dialog";
import { formatPhone, toMinutes, toTime } from "../../data/booking";
import { formatFullDate, type Appointment } from "../../data/painel";
import type { Professional } from "../../data/professionals";
import { formatDuration } from "../../data/services";
import { getShopMinutes } from "../../data/shop";
import {
  createAppointment,
  fetchAppointments,
  fetchFreeTimes,
  findCustomerByPhone,
  PainelApiError,
  rescheduleAppointment,
} from "../lib/painel-api";
import { DialogFrame, Field, FormAlert, SubmitButton, useDialogIds, type DialogIds } from "./admin-form";
import {
  usePainelProfessionals,
  usePainelServices,
  usePainelSlotInterval,
  usePainelTimezone,
  usePainelToday,
} from "./painel-catalog";

// Novo horário e remarcação pela Visão geral (só admin). Os horários são os mesmos do
// agendamento do site (grade fixa, expediente, folgas e antecedência): o painel só marca num
// horário livre, e ele deixa de aparecer para o cliente. Os ocupados do profissional aparecem
// marcados, com quem está no horário. O banco confere tudo de novo ao gravar.

const unexpected = "Não foi possível falar com o banco. Verifique a conexão e tente de novo.";

function getErrorMessage(error: unknown) {
  return error instanceof PainelApiError ? error.message : unexpected;
}

/** Profissionais ativos que atendem todos os serviços (pelos slugs). */
function listCapable(professionals: readonly Professional[], serviceSlugs: string[]) {
  return professionals.filter(
    (professional) =>
      professional.isActive && !professional.deletedAt && serviceSlugs.every((slug) => professional.serviceIds.includes(slug)),
  );
}

type Range = { minDate: string; maxDate: string };

type ScheduleValues = { professionalId: string; date: string; time: string };

type ScheduleErrors = Partial<Record<"professional" | "date" | "time", string>>;

function validateSchedule(values: ScheduleValues, range: Range): ScheduleErrors {
  const errors: ScheduleErrors = {};
  if (!values.professionalId) errors.professional = "Escolha o profissional.";
  if (!values.date) errors.date = "Escolha a data.";
  else if (values.date < range.minDate || values.date > range.maxDate) {
    errors.date = `Escolha entre ${formatFullDate(range.minDate)} e ${formatFullDate(range.maxDate)}.`;
  }
  if (!values.time) errors.time = "Escolha um horário livre.";
  return errors;
}

type Slot = { time: string; busyWith: Appointment | null };

/**
 * Grade do dia para o profissional: os horários livres do site e, no meio deles, os que já
 * têm atendimento dele (agendado ou concluído). `excludeId` é o atendimento sendo remarcado.
 */
function useDaySlots(professional: Professional | null, serviceSlugs: string[], date: string, excludeId?: string) {
  const interval = usePainelSlotInterval();
  const timezone = usePainelTimezone();
  const today = usePainelToday();
  const slugsKey = serviceSlugs.join(",");
  const freeLoader = useMemo(
    () =>
      professional && slugsKey && date
        ? () => fetchFreeTimes({ serviceSlugs: slugsKey.split(","), professionalSlug: professional.slug, date })
        : null,
    [professional, slugsKey, date],
  );
  const dayLoader = useMemo(
    () => (freeLoader ? () => fetchAppointments({ start: date, end: date }) : null),
    [freeLoader, date],
  );
  const free = useAsyncData(freeLoader);
  const day = useAsyncData(dayLoader);

  if (!freeLoader || !professional) return { status: "idle" as const };
  if (free.status === "error" || day.status === "error") {
    return {
      status: "error" as const,
      message: getErrorMessage(free.status === "error" ? free.error : day.status === "error" ? day.error : null),
      retry: () => {
        free.retry();
        day.retry();
      },
    };
  }
  if (free.status !== "success" || day.status !== "success") return { status: "loading" as const };

  // Hoje, o que já passou não interessa (nem ocupado).
  const now = date === today ? getShopMinutes(timezone) : -1;
  const busy = new Map<string, Appointment>();
  for (const appointment of day.data) {
    if (appointment.performedById !== professional.id || appointment.id === excludeId) continue;
    if (appointment.status !== "agendado" && appointment.status !== "concluido") continue;
    const start = toMinutes(appointment.time);
    for (let minute = start; minute < start + appointment.durationMinutes; minute += interval) {
      if (minute >= now) busy.set(toTime(minute), appointment);
    }
  }
  const times = [...new Set([...free.data, ...busy.keys()])].sort();
  const slots: Slot[] = times.map((time) => ({ time, busyWith: free.data.includes(time) ? null : (busy.get(time) ?? null) }));
  return { status: "success" as const, slots, freeCount: free.data.length };
}

/** Profissional, data e a grade de horários (livres para escolher, ocupados com aviso). */
function ScheduleFields({
  ids,
  professionals,
  serviceSlugs,
  values,
  errors,
  range,
  excludeId,
  onChange,
}: {
  ids: string;
  professionals: readonly Professional[];
  serviceSlugs: string[];
  values: ScheduleValues;
  errors: ScheduleErrors;
  range: Range;
  excludeId?: string;
  onChange: (changes: Partial<ScheduleValues>) => void;
}) {
  const interval = usePainelSlotInterval();
  const professional = professionals.find((item) => item.id === values.professionalId) ?? null;
  const day = useDaySlots(professional, serviceSlugs, values.date, excludeId);
  const [warning, setWarning] = useState<string | null>(null);

  // Trocar profissional ou data limpa a hora: ela só vale na grade que estava na tela.
  function change(changes: Partial<ScheduleValues>) {
    setWarning(null);
    onChange("time" in changes ? changes : { ...changes, time: "" });
  }

  function warn(slot: Slot) {
    const appointment = slot.busyWith!;
    setWarning(
      `Já tem um agendamento marcado para as ${slot.time}: ${appointment.clientName}, ${appointment.serviceName} (${appointment.time}, ${formatDuration(appointment.durationMinutes)}). Escolha outro horário ou outro profissional.`,
    );
  }

  return (
    <>
      <Field error={errors.professional} id={`${ids}-professional`} label="Profissional">
        <select
          aria-describedby={`${ids}-professional-message`}
          aria-invalid={errors.professional ? true : undefined}
          id={`${ids}-professional`}
          onChange={(event) => change({ professionalId: event.target.value })}
          value={values.professionalId}
        >
          <option value="">{professionals.length ? "Escolha" : "Nenhum profissional atende este serviço"}</option>
          {professionals.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>

      <Field error={errors.date} id={`${ids}-date`} label="Data">
        <input
          aria-describedby={`${ids}-date-message`}
          aria-invalid={errors.date ? true : undefined}
          id={`${ids}-date`}
          max={range.maxDate}
          min={range.minDate}
          onChange={(event) => change({ date: event.target.value })}
          type="date"
          value={values.date}
        />
      </Field>

      <div
        aria-describedby={`${ids}-time-message`}
        aria-labelledby={`${ids}-time-label`}
        className={`admin-slots${errors.time ? " has-error" : ""}`}
        id={`${ids}-time`}
        role="group"
        tabIndex={-1}
      >
        <p className="admin-slots__label" id={`${ids}-time-label`}>
          Horário
        </p>
        {day.status === "idle" ? (
          <p className="admin-field__hint" id={`${ids}-time-message`}>
            Escolha o profissional e a data para ver os horários.
          </p>
        ) : day.status === "loading" ? (
          <p className="admin-field__hint" id={`${ids}-time-message`}>
            Carregando horários…
          </p>
        ) : day.status === "error" ? (
          <p className="admin-field__error" id={`${ids}-time-message`}>
            <CircleAlert aria-hidden="true" size={13} />
            {day.message}{" "}
            <button className="admin-text-button" onClick={day.retry} type="button">
              Tentar de novo
            </button>
          </p>
        ) : (
          <>
            <p className={errors.time ? "admin-field__error" : "admin-field__hint"} id={`${ids}-time-message`}>
              {errors.time ? <CircleAlert aria-hidden="true" size={13} /> : null}
              {errors.time ??
                (day.freeCount
                  ? `Os mesmos horários do agendamento do site, de ${interval} em ${interval} minutos.`
                  : "Nenhum horário livre para esse profissional nesse dia. Escolha outra data ou outro profissional.")}
            </p>
            {day.slots.length ? (
              <ul>
                {day.slots.map((slot) => {
                  const selected = values.time === slot.time && !slot.busyWith;
                  return (
                    <li key={slot.time}>
                      {slot.busyWith ? (
                        <button
                          aria-disabled="true"
                          className="is-busy"
                          onClick={() => warn(slot)}
                          title={`Ocupado: ${slot.busyWith.clientName}`}
                          type="button"
                        >
                          {slot.time}
                          <span className="sr-only"> (ocupado)</span>
                        </button>
                      ) : (
                        <button
                          aria-pressed={selected}
                          className={selected ? "is-active" : undefined}
                          onClick={() => change({ time: slot.time })}
                          type="button"
                        >
                          {slot.time}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {warning ? (
              <p className="admin-dialog__alert admin-dialog__alert--info" role="alert">
                <CircleAlert aria-hidden="true" size={15} />
                {warning}
              </p>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

// --- Novo horário ---

function NewAppointmentForm({
  dialogIds,
  defaultDate,
  initialPhone,
  range,
  onClose,
  onSaved,
}: {
  dialogIds: DialogIds;
  defaultDate: string;
  initialPhone?: string;
  range: Range;
  onClose: () => void;
  onSaved: (appointment: Appointment) => void;
}) {
  const ids = useId();
  const timezone = usePainelTimezone();
  const professionals = usePainelProfessionals();
  const services = usePainelServices().filter((service) => service.isActive && !service.deletedAt);
  const [phone, setPhone] = useState(() => formatPhone(initialPhone ?? ""));
  const [name, setName] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [schedule, setSchedule] = useState({ professionalId: "", date: defaultDate, time: "" });
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const digits = phone.replace(/\D/g, "");
  const phoneValid = /^\d{10,11}$/.test(digits);
  const lookup = useCallback(() => findCustomerByPhone(digits), [digits]);
  const found = useAsyncData(phoneValid ? lookup : null);
  const customer = found.status === "success" ? found.data : null;

  const service = services.find((item) => item.id === serviceId) ?? null;
  const serviceSlugs = service ? [service.slug] : [];
  const capable = service ? listCapable(professionals, serviceSlugs) : [];

  const errors: Partial<Record<"phone" | "name" | "service" | "professional" | "date" | "time", string>> = attempted
    ? {
        phone: phoneValid ? undefined : "Informe o telefone com DDD.",
        name: customer || name.trim().length >= 2 ? undefined : "Informe o nome do cliente.",
        service: service ? undefined : "Escolha o serviço.",
        ...validateSchedule(schedule, range),
      }
    : {};

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    setFormError(null);

    const problems = {
      phone: !phoneValid,
      name: !customer && name.trim().length < 2,
      service: !service,
      ...validateSchedule(schedule, range),
    };
    const first = (["phone", "name", "service", "professional", "date", "time"] as const).find((field) => problems[field]);
    if (first || !service) {
      if (first) document.getElementById(`${ids}-${first}`)?.focus();
      return;
    }

    setBusy(true);
    try {
      const created = await createAppointment(
        {
          customerName: customer?.name ?? name,
          customerPhone: digits,
          serviceId: service.id,
          professionalId: schedule.professionalId,
          date: schedule.date,
          time: schedule.time,
        },
        timezone,
      );
      onSaved(created);
    } catch (error) {
      setFormError(getErrorMessage(error));
      setBusy(false);
    }
  }

  return (
    <DialogFrame
      description="Para quem ligou, mandou mensagem ou passou na barbearia. O cliente não precisa ter cadastro."
      descriptionId={dialogIds.descriptionId}
      footer={
        <>
          <button className="admin-text-button" disabled={busy} onClick={onClose} type="button">
            Cancelar
          </button>
          <SubmitButton busy={busy} busyLabel="Marcando…" label="Marcar horário" />
        </>
      }
      onClose={onClose}
      onSubmit={submit}
      title="Novo horário"
      titleId={dialogIds.titleId}
    >
      <div className="admin-form-row">
        <Field
          error={errors.phone}
          hint={customer ? "Cliente já cadastrado." : undefined}
          id={`${ids}-phone`}
          label="Telefone"
        >
          <input
            aria-describedby={`${ids}-phone-message`}
            aria-invalid={errors.phone ? true : undefined}
            autoComplete="off"
            id={`${ids}-phone`}
            inputMode="tel"
            maxLength={15}
            onChange={(event) => setPhone(formatPhone(event.target.value))}
            placeholder="(31) 99999-9999"
            type="tel"
            value={phone}
          />
        </Field>
        <Field error={errors.name} id={`${ids}-name`} label="Nome do cliente">
          <input
            aria-describedby={`${ids}-name-message`}
            aria-invalid={errors.name ? true : undefined}
            autoComplete="off"
            id={`${ids}-name`}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            readOnly={Boolean(customer)}
            value={customer ? customer.name : name}
          />
        </Field>
      </div>

      <Field error={errors.service} id={`${ids}-service`} label="Serviço">
        <select
          aria-describedby={`${ids}-service-message`}
          aria-invalid={errors.service ? true : undefined}
          id={`${ids}-service`}
          onChange={(event) => {
            const next = services.find((item) => item.id === event.target.value);
            setServiceId(event.target.value);
            // Mantém o profissional só se ele atende o novo serviço.
            setSchedule((current) => ({
              ...current,
              professionalId:
                next && listCapable(professionals, [next.slug]).some((item) => item.id === current.professionalId)
                  ? current.professionalId
                  : "",
              time: "",
            }));
          }}
          value={serviceId}
        >
          <option value="">Escolha</option>
          {services.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {formatDuration(item.durationMinutes)}
            </option>
          ))}
        </select>
      </Field>

      {service ? (
        <ScheduleFields
          errors={errors}
          ids={ids}
          onChange={(changes) => setSchedule((current) => ({ ...current, ...changes }))}
          professionals={capable}
          range={range}
          serviceSlugs={serviceSlugs}
          values={schedule}
        />
      ) : null}

      <FormAlert message={formError} />
    </DialogFrame>
  );
}

export function NewAppointmentDialog({
  open,
  openKey,
  defaultDate,
  initialPhone,
  range,
  onClose,
  onSaved,
}: {
  open: boolean;
  openKey: number;
  defaultDate: string;
  /** Telefone já preenchido (a partir da ficha do cliente). */
  initialPhone?: string;
  range: Range;
  onClose: () => void;
  onSaved: (appointment: Appointment) => void;
}) {
  const dialogIds = useDialogIds();
  return (
    <Dialog
      className="admin-dialog"
      describedBy={dialogIds.descriptionId}
      labelledBy={dialogIds.titleId}
      onClose={onClose}
      open={open}
    >
      <NewAppointmentForm
        defaultDate={defaultDate}
        dialogIds={dialogIds}
        initialPhone={initialPhone}
        key={openKey}
        onClose={onClose}
        onSaved={onSaved}
        range={range}
      />
    </Dialog>
  );
}

// --- Remarcar ---

function RescheduleForm({
  appointment,
  dialogIds,
  range,
  onClose,
  onSaved,
}: {
  appointment: Appointment;
  dialogIds: DialogIds;
  range: Range;
  onClose: () => void;
  onSaved: (appointment: Appointment) => void;
}) {
  const ids = useId();
  const timezone = usePainelTimezone();
  const serviceSlugs = appointment.items.map((item) => item.serviceSlug);
  const capable = listCapable(usePainelProfessionals(), serviceSlugs);
  const [schedule, setSchedule] = useState({
    professionalId: capable.some((item) => item.id === appointment.performedById) ? appointment.performedById : "",
    date: appointment.date,
    time: appointment.time,
  });
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const errors = attempted ? validateSchedule(schedule, range) : {};
  const unchanged =
    schedule.professionalId === appointment.performedById &&
    schedule.date === appointment.date &&
    schedule.time === appointment.time;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    setFormError(null);

    const problems = validateSchedule(schedule, range);
    const first = (["professional", "date", "time"] as const).find((field) => problems[field]);
    if (first) {
      document.getElementById(`${ids}-${first}`)?.focus();
      return;
    }
    if (unchanged) {
      onClose();
      return;
    }

    setBusy(true);
    try {
      onSaved(await rescheduleAppointment(appointment.id, schedule, timezone));
    } catch (error) {
      setFormError(getErrorMessage(error));
      setBusy(false);
    }
  }

  return (
    <DialogFrame
      description={`${appointment.clientName} · ${appointment.serviceName} · ${formatDuration(appointment.durationMinutes)}. Marcado para ${formatFullDate(appointment.date)} às ${appointment.time}.`}
      descriptionId={dialogIds.descriptionId}
      footer={
        <>
          <button className="admin-text-button" disabled={busy} onClick={onClose} type="button">
            Cancelar
          </button>
          <SubmitButton busy={busy} busyLabel="Remarcando…" label="Remarcar" />
        </>
      }
      onClose={onClose}
      onSubmit={submit}
      title="Remarcar horário"
      titleId={dialogIds.titleId}
    >
      <ScheduleFields
        errors={errors}
        ids={ids}
        onChange={(changes) => setSchedule((current) => ({ ...current, ...changes }))}
        professionals={capable}
        range={range}
        excludeId={appointment.id}
        serviceSlugs={serviceSlugs}
        values={schedule}
      />
      <FormAlert message={formError} />
    </DialogFrame>
  );
}

export function RescheduleDialog({
  open,
  openKey,
  appointment,
  range,
  onClose,
  onSaved,
}: {
  open: boolean;
  openKey: number;
  appointment: Appointment | null;
  range: Range;
  onClose: () => void;
  onSaved: (appointment: Appointment) => void;
}) {
  const dialogIds = useDialogIds();
  return (
    <Dialog
      className="admin-dialog"
      describedBy={dialogIds.descriptionId}
      labelledBy={dialogIds.titleId}
      onClose={onClose}
      open={open}
    >
      {appointment ? (
        <RescheduleForm
          appointment={appointment}
          dialogIds={dialogIds}
          key={openKey}
          onClose={onClose}
          onSaved={onSaved}
          range={range}
        />
      ) : null}
    </Dialog>
  );
}
