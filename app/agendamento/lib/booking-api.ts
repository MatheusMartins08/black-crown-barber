import {
  ANY_PROFESSIONAL,
  hasErrors,
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
// (supabase/migrations/…120500_booking_rpc.sql, …121000_subscriber_accounts.sql e
// …20261009130000_multi_service_booking.sql, que recebe a lista de serviços em p_services).
// O banco revalida tudo: serviços e combos, expediente, bloqueios, antecedência, horário
// livre (pela duração somada) e plano.

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
  serviceIds: readonly ServiceId[];
  professionalId: ProfessionalChoice;
};

const genericMessage = "Não foi possível falar com a agenda agora. Tente novamente.";

function fail(error: RpcError): never {
  throw new BookingApiError(
    getRpcMessage(error, genericMessage),
    // BC002: o horário foi ocupado; BC012: combo incompatível (a seleção precisa mudar).
    error.code === "BC002" ? "slot_unavailable" : "invalid_request",
  );
}

type SlotRow = { slot_time: string; professional_slugs: string[] };

function toSlot(row: SlotRow): TimeSlot {
  return {
    time: row.slot_time,
    // O banco só devolve profissionais ativos que atendem o serviço.
    professionalIds: row.professional_slugs.filter((slug): slug is ProfessionalId => slug !== ANY_PROFESSIONAL),
  };
}

/** Horários livres de um dia. */
export async function fetchDayAvailability(query: AvailabilityQuery & { date: string }): Promise<TimeSlot[]> {
  const { data, error } = await getSupabaseBrowserClient().rpc("get_day_availability", {
    p_services: query.serviceIds,
    p_professional: query.professionalId,
    p_date: query.date,
  });
  if (error) fail(error);
  return (data as SlotRow[]).map(toSlot);
}

/** Resumo de disponibilidade para a janela de datas exibida no calendário. */
export async function fetchDaySummaries(query: AvailabilityQuery & { startDate: string; days: number }): Promise<DaySummary[]> {
  const { data, error } = await getSupabaseBrowserClient().rpc("get_day_summaries", {
    p_services: query.serviceIds,
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
    p_services: query.serviceIds,
    p_professional: query.professionalId,
    p_from: query.fromDate,
  });
  if (error) fail(error);
  const [row] = data as (SlotRow & { day: string })[];
  return row ? { date: row.day, slot: toSlot(row) } : null;
}

function getSlotParams(draft: BookingDraft) {
  const { serviceIds, professionalId, date, time } = draft;
  if (!serviceIds.length || !professionalId || !date || !time) {
    throw new BookingApiError("Revise os dados do agendamento antes de confirmar.", "invalid_request");
  }
  return {
    p_services: serviceIds,
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
 * cliente vêm da conta, e o servidor decide, serviço a serviço, o que o plano cobre.
 */
export async function createSubscriberReservation(draft: BookingDraft): Promise<Reservation> {
  const { data, error } = await getSupabaseBrowserClient().rpc("create_subscriber_reservation", getSlotParams(draft));
  if (error) fail(error);
  return data as Reservation;
}
