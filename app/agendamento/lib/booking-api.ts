import {
  hasErrors,
  isProfessionalChoice,
  validateCustomer,
  type BookingDraft,
  type DaySummary,
  type ProfessionalChoice,
  type ProfessionalId,
  type Reservation,
  type ServiceId,
  type TimeSlot,
} from "../../data/booking";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { getRpcMessage, type RpcError } from "../../lib/supabase/errors";

// Adaptador da agenda: cada função chama uma RPC pública do Supabase
// (supabase/migrations/…120500_booking_rpc.sql e …121000_subscriber_accounts.sql).
// O banco revalida tudo: expediente, bloqueios, antecedência, horário livre e plano.

export class BookingApiError extends Error {
  constructor(
    message: string,
    readonly reason: "slot_unavailable" | "invalid_request",
  ) {
    super(message);
    this.name = "BookingApiError";
  }
}

type AvailabilityQuery = {
  serviceId: ServiceId;
  professionalId: ProfessionalChoice;
};

const genericMessage = "Não foi possível falar com a agenda agora. Tente novamente.";

function fail(error: RpcError): never {
  throw new BookingApiError(
    getRpcMessage(error, genericMessage),
    error.code === "BC002" ? "slot_unavailable" : "invalid_request",
  );
}

type SlotRow = { slot_time: string; professional_slugs: string[] };

function toSlot(row: SlotRow): TimeSlot {
  return {
    time: row.slot_time,
    professionalIds: row.professional_slugs.filter(
      (slug): slug is ProfessionalId => isProfessionalChoice(slug) && slug !== "qualquer",
    ),
  };
}

/** Horários livres de um dia. */
export async function fetchDayAvailability(query: AvailabilityQuery & { date: string }): Promise<TimeSlot[]> {
  const { data, error } = await getSupabaseBrowserClient().rpc("get_day_availability", {
    p_service: query.serviceId,
    p_professional: query.professionalId,
    p_date: query.date,
  });
  if (error) fail(error);
  return (data as SlotRow[]).map(toSlot);
}

/** Resumo de disponibilidade para a janela de datas exibida no calendário. */
export async function fetchDaySummaries(query: AvailabilityQuery & { startDate: string; days: number }): Promise<DaySummary[]> {
  const { data, error } = await getSupabaseBrowserClient().rpc("get_day_summaries", {
    p_service: query.serviceId,
    p_professional: query.professionalId,
    p_start: query.startDate,
    p_days: query.days,
  });
  if (error) fail(error);
  return (data as { day: string; status: DaySummary["status"]; available_count: number }[]).map((row) => ({
    date: row.day,
    status: row.status,
    availableCount: row.available_count,
  }));
}

/** Primeiro horário livre a partir de uma data, dentro da janela de agendamento. */
export async function findNextAvailable(query: AvailabilityQuery & { fromDate: string }) {
  const { data, error } = await getSupabaseBrowserClient().rpc("find_next_available", {
    p_service: query.serviceId,
    p_professional: query.professionalId,
    p_from: query.fromDate,
  });
  if (error) fail(error);
  const [row] = data as (SlotRow & { day: string })[];
  return row ? { date: row.day, slot: toSlot(row) } : null;
}

function getSlotParams(draft: BookingDraft) {
  const { serviceId, professionalId, date, time } = draft;
  if (!serviceId || !professionalId || !date || !time) {
    throw new BookingApiError("Revise os dados do agendamento antes de confirmar.", "invalid_request");
  }
  return {
    p_service: serviceId,
    p_professional: professionalId,
    p_date: date,
    p_time: time,
    p_assigned_professional: draft.assignedProfessionalId,
  };
}

/** Confirma a reserva de quem não é assinante (create_reservation). */
export async function createReservation(draft: BookingDraft): Promise<Reservation> {
  if (hasErrors(validateCustomer(draft.customer))) {
    throw new BookingApiError("Revise os dados do agendamento antes de confirmar.", "invalid_request");
  }

  const { data, error } = await getSupabaseBrowserClient().rpc("create_reservation", {
    ...getSlotParams(draft),
    p_name: draft.customer.name,
    p_phone: draft.customer.phone,
    p_email: draft.customer.email,
    p_whatsapp_opt_in: draft.customer.whatsappOptIn,
  });
  if (error) fail(error);
  return data as Reservation;
}

/**
 * Confirma a reserva do assinante logado (create_subscriber_reservation). Os dados do
 * cliente vêm da conta, e o servidor decide se o plano cobre o atendimento.
 */
export async function createSubscriberReservation(draft: BookingDraft): Promise<Reservation> {
  const { data, error } = await getSupabaseBrowserClient().rpc("create_subscriber_reservation", getSlotParams(draft));
  if (error) fail(error);
  return data as Reservation;
}
