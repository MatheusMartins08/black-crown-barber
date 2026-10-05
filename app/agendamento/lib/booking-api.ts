import {
  ANY_PROFESSIONAL,
  addDays,
  bookingRules,
  getMinutesOfDay,
  getOpeningWindow,
  getProfessionalsForService,
  getService,
  getTodayIso,
  hasErrors,
  toMinutes,
  toTime,
  validateCustomer,
  type BookingDraft,
  type DaySummary,
  type ProfessionalChoice,
  type ProfessionalId,
  type Reservation,
  type ServiceId,
  type TimeSlot,
} from "../../data/booking";

// Adaptador da agenda. Este é o único ponto que precisa mudar ao conectar um
// backend: cada função assíncrona abaixo vira uma chamada à API (ou Server Action)
// mantendo as mesmas assinaturas. Enquanto isso, a ocupação é demonstrativa e
// determinística (mesma data e profissional sempre geram os mesmos horários livres).

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

const simulatedLatency = 350;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return hash;
}

// Mesmo gerador usado na agenda ilustrativa do painel.
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const baseOccupancy: Record<ProfessionalId, number> = { julia: 0.5, rafael: 0.42, joao: 0.34 };

/** Blocos de 30 min ocupados na agenda demonstrativa de um profissional. */
function getBusyBlocks(professionalId: ProfessionalId, date: string, blockCount: number) {
  const random = createRandom(hashSeed(`${professionalId}:${date}`));
  const fullyBooked = random() < 0.1;
  const load = fullyBooked ? 1 : baseOccupancy[professionalId] * (0.6 + random() * 0.8);
  return Array.from({ length: blockCount }, () => random() < load);
}

function getProfessionalSlots(serviceId: ServiceId, professionalId: ProfessionalId, date: string, now: Date) {
  const service = getService(serviceId);
  const opening = getOpeningWindow(date);
  if (!service || !opening) return [];

  const interval = bookingRules.slotIntervalMinutes;
  const busy = getBusyBlocks(professionalId, date, Math.ceil((opening.closes - opening.opens) / interval));
  const blocksNeeded = Math.ceil(service.durationMinutes / interval);
  const earliest = date === getTodayIso(now) ? getMinutesOfDay(now) + bookingRules.minLeadMinutes : 0;
  const times: string[] = [];

  for (let start = opening.opens; start + service.durationMinutes <= opening.closes; start += interval) {
    const firstBlock = (start - opening.opens) / interval;
    const isFree = busy.slice(firstBlock, firstBlock + blocksNeeded).every((blocked) => !blocked);
    if (isFree && start >= earliest) times.push(toTime(start));
  }

  return times;
}

function computeDaySlots({ serviceId, professionalId }: AvailabilityQuery, date: string, now = new Date()): TimeSlot[] {
  const today = getTodayIso(now);
  if (date < today) return [];

  const candidates =
    professionalId === ANY_PROFESSIONAL
      ? getProfessionalsForService(serviceId).map((professional) => professional.id)
      : [professionalId];
  const slots = new Map<string, ProfessionalId[]>();

  for (const candidate of candidates) {
    for (const time of getProfessionalSlots(serviceId, candidate, date, now)) {
      slots.set(time, [...(slots.get(time) ?? []), candidate]);
    }
  }

  return [...slots.entries()]
    .map(([time, professionalIds]) => ({ time, professionalIds }))
    .sort((first, second) => toMinutes(first.time) - toMinutes(second.time));
}

/** Horários livres de um dia. */
export async function fetchDayAvailability(query: AvailabilityQuery & { date: string }): Promise<TimeSlot[]> {
  await wait(simulatedLatency);
  return computeDaySlots(query, query.date);
}

/** Resumo de disponibilidade para a janela de datas exibida no calendário. */
export async function fetchDaySummaries(query: AvailabilityQuery & { startDate: string; days: number }): Promise<DaySummary[]> {
  await wait(simulatedLatency);
  return Array.from({ length: query.days }, (_, index): DaySummary => {
    const date = addDays(query.startDate, index);
    if (!getOpeningWindow(date)) return { date, status: "closed", availableCount: 0 };
    const availableCount = computeDaySlots(query, date).length;
    return { date, status: availableCount ? "open" : "full", availableCount };
  });
}

/** Primeiro horário livre a partir de uma data, dentro da janela de agendamento. */
export async function findNextAvailable(query: AvailabilityQuery & { fromDate: string }) {
  await wait(simulatedLatency);
  const limit = addDays(getTodayIso(), bookingRules.windowDays);

  for (let date = query.fromDate; date < limit; date = addDays(date, 1)) {
    const [slot] = computeDaySlots(query, date);
    if (slot) return { date, slot };
  }

  return null;
}

function createReservationCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return `BC-${Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("")}`;
}

/** Confirma a reserva. No backend real, esta chamada deve revalidar tudo no servidor. */
export async function createReservation(draft: BookingDraft): Promise<Reservation> {
  await wait(simulatedLatency * 3);

  const { serviceId, professionalId, date, time } = draft;
  const service = getService(serviceId);
  if (!service || !professionalId || !date || !time || hasErrors(validateCustomer(draft.customer))) {
    throw new BookingApiError("Revise os dados do agendamento antes de confirmar.", "invalid_request");
  }

  const slot = computeDaySlots({ serviceId: service.id, professionalId }, date).find((item) => item.time === time);
  const assignedId =
    draft.assignedProfessionalId && slot?.professionalIds.includes(draft.assignedProfessionalId)
      ? draft.assignedProfessionalId
      : slot?.professionalIds[0];

  if (!slot || !assignedId) {
    throw new BookingApiError("Esse horário acabou de ser ocupado. Escolha outro horário.", "slot_unavailable");
  }

  return {
    code: createReservationCode(),
    status: "confirmado",
    createdAt: new Date().toISOString(),
    serviceId: service.id,
    professionalId: assignedId,
    requestedAnyProfessional: professionalId === ANY_PROFESSIONAL,
    date,
    time,
    durationMinutes: service.durationMinutes,
    price: service.price,
    customer: {
      name: draft.customer.name.trim(),
      phone: draft.customer.phone,
      email: draft.customer.email.trim(),
      notes: draft.customer.notes.trim(),
      whatsappOptIn: draft.customer.whatsappOptIn,
    },
  };
}
