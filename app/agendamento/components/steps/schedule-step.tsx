"use client";

import { useCallback, useMemo, useState } from "react";
import { CalendarX2, RotateCw } from "lucide-react";
import {
  ANY_PROFESSIONAL,
  addDays,
  bookingRules,
  formatLongDate,
  formatSlotLabel,
  getOpeningWindow,
  getProfessional,
  getTodayIso,
  type ProfessionalChoice,
  type ProfessionalId,
  type ServiceId,
  type TimeSlot,
} from "../../../data/booking";
import { fetchDayAvailability, fetchDaySummaries, findNextAvailable } from "../../lib/booking-api";
import ProfessionalAvatar from "../professional-avatar";
import useAsyncData from "../../../components/use-async-data";
import DateStrip from "./date-strip";
import TimeSlotGroups, { TimeSlotSkeleton } from "./time-slot-groups";

type ScheduleStepProps = {
  serviceId: ServiceId;
  professionalId: ProfessionalChoice;
  date: string | null;
  time: string | null;
  assignedProfessionalId: ProfessionalId | null;
  onSelectDate: (date: string) => void;
  onSelectSlot: (date: string, slot: TimeSlot) => void;
  /** Recebe os horários carregados para descartar uma escolha que deixou de existir. */
  onSlotsLoaded: (date: string, slots: TimeSlot[]) => void;
  onUseAnyProfessional: () => void;
  onChangeProfessional: () => void;
};

export default function ScheduleStep({
  serviceId,
  professionalId,
  date,
  time,
  assignedProfessionalId,
  onSelectDate,
  onSelectSlot,
  onSlotsLoaded,
  onUseAnyProfessional,
  onChangeProfessional,
}: ScheduleStepProps) {
  const [today] = useState(getTodayIso);

  const summariesLoader = useCallback(
    () => fetchDaySummaries({ serviceId, professionalId, startDate: today, days: bookingRules.windowDays }),
    [serviceId, professionalId, today],
  );
  const summaries = useAsyncData(summariesLoader);
  const days = summaries.status === "success" ? summaries.data : null;

  // Sem data escolhida, abre no primeiro dia com horário livre.
  const firstOpenDate = days?.find((day) => day.status === "open")?.date ?? days?.[0]?.date ?? null;
  const activeDate = date ?? firstOpenDate;

  const slotsLoader = useMemo(
    () =>
      activeDate
        ? async () => {
            const slots = await fetchDayAvailability({ serviceId, professionalId, date: activeDate });
            onSlotsLoaded(activeDate, slots);
            return slots;
          }
        : null,
    [activeDate, serviceId, professionalId, onSlotsLoaded],
  );
  const slots = useAsyncData(slotsLoader);

  const isEmpty = slots.status === "success" && slots.data.length === 0;
  const nextLoader = useMemo(
    () =>
      isEmpty && activeDate
        ? () => findNextAvailable({ serviceId, professionalId, fromDate: addDays(activeDate, 1) })
        : null,
    [isEmpty, activeDate, serviceId, professionalId],
  );
  const next = useAsyncData(nextLoader);

  const professional = professionalId === ANY_PROFESSIONAL ? null : getProfessional(professionalId);
  const assignee = professionalId === ANY_PROFESSIONAL && date === activeDate && time ? getProfessional(assignedProfessionalId) : null;

  return (
    <div className="schedule">
      {summaries.status === "error" ? (
        <div className="booking-alert" role="alert">
          <p>
            <strong>Não foi possível carregar o calendário.</strong> Verifique sua conexão e tente de novo.
          </p>
          <button className="booking-text-button" onClick={summaries.retry} type="button">
            <RotateCw aria-hidden="true" size={14} /> Tentar novamente
          </button>
        </div>
      ) : (
        <DateStrip days={days} onSelect={onSelectDate} selectedDate={activeDate} />
      )}

      <div aria-busy={slots.status === "loading"} className="slot-panel">
        {activeDate ? <h3 className="slot-panel__date">{formatLongDate(activeDate)}</h3> : null}

        {slots.status === "idle" || slots.status === "loading" ? (
          summaries.status === "error" ? null : <TimeSlotSkeleton />
        ) : slots.status === "error" ? (
          <div className="booking-alert" role="alert">
            <p>
              <strong>Não foi possível carregar os horários.</strong> Tente novamente em instantes.
            </p>
            <button className="booking-text-button" onClick={slots.retry} type="button">
              <RotateCw aria-hidden="true" size={14} /> Tentar novamente
            </button>
          </div>
        ) : isEmpty && activeDate ? (
          <div className="booking-empty">
            <span className="booking-empty__icon">
              <CalendarX2 aria-hidden="true" size={20} strokeWidth={1.6} />
            </span>
            <p className="booking-empty__title">
              {getOpeningWindow(activeDate) ? "Nenhum horário livre neste dia." : "A barbearia não abre neste dia."}
            </p>
            <p className="booking-empty__text">
              {professional
                ? `A agenda de ${professional.name.split(" ")[0]} está completa nesta data. Veja o próximo horário ou escolha outro profissional.`
                : "Veja o próximo horário disponível ou escolha outro dia no calendário."}
            </p>
            <div className="booking-empty__actions">
              {next.status === "loading" ? (
                <span className="booking-empty__searching">Procurando o próximo horário…</span>
              ) : next.status === "success" && next.data ? (
                <button
                  className="button button--compact"
                  onClick={() => onSelectSlot(next.data!.date, next.data!.slot)}
                  type="button"
                >
                  Próximo horário: {formatSlotLabel(next.data.date, next.data.slot.time)}
                </button>
              ) : next.status === "success" ? (
                <span className="booking-empty__searching">Sem horários livres nas próximas semanas.</span>
              ) : null}
              {professional ? (
                <button className="booking-text-button" onClick={onUseAnyProfessional} type="button">
                  Ver horários de toda a equipe
                </button>
              ) : null}
              <button className="booking-text-button" onClick={onChangeProfessional} type="button">
                Trocar profissional
              </button>
            </div>
          </div>
        ) : slots.status === "success" && activeDate ? (
          <>
            <TimeSlotGroups
              key={activeDate}
              onSelect={(slot) => onSelectSlot(activeDate, slot)}
              selectedTime={date === activeDate ? time : null}
              slots={slots.data}
            />
            {assignee ? (
              <p className="slot-panel__assignee">
                <ProfessionalAvatar professionalId={assignee.id} size={32} />
                <span>
                  Atendimento com <strong>{assignee.name}</strong>
                  <small>Primeiro profissional livre neste horário.</small>
                </span>
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
