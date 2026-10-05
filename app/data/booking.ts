import type { PlanId } from "./plans";
import { barbers, openingHours, services } from "./site";

// Regras e dados do fluxo de agendamento. Tudo aqui é puro (sem React e sem rede)
// para poder ser reaproveitado no servidor quando existir uma API de agenda.

export type ServiceId = (typeof services)[number]["id"];
export type ProfessionalId = (typeof barbers)[number]["id"];

export const ANY_PROFESSIONAL = "qualquer";
export type ProfessionalChoice = ProfessionalId | typeof ANY_PROFESSIONAL;

// Durações e valores numéricos usados no cálculo da agenda. Mantenha em sincronia
// com os textos de `services` em site.ts.
const servicePricing = {
  corte: { durationMinutes: 30, price: 55 },
  barba: { durationMinutes: 30, price: 45 },
  "corte-barba": { durationMinutes: 50, price: 90 },
  sobrancelha: { durationMinutes: 15, price: 25 },
} satisfies Record<ServiceId, { durationMinutes: number; price: number }>;

export const bookingServices = services.map((service) => ({
  ...service,
  ...servicePricing[service.id],
}));

export type BookingService = (typeof bookingServices)[number];

const allServiceIds = services.map((service) => service.id);

// Hoje todos os profissionais atendem todos os serviços. Restrinja aqui quando a
// barbearia definir especialidades exclusivas.
const servicesByProfessional: Record<ProfessionalId, readonly ServiceId[]> = {
  julia: allServiceIds,
  rafael: allServiceIds,
  joao: allServiceIds,
};

export const bookingProfessionals = barbers.map((barber) => ({
  ...barber,
  serviceIds: servicesByProfessional[barber.id],
}));

export type BookingProfessional = (typeof bookingProfessionals)[number];

export const bookingRules = {
  windowDays: 21,
  slotIntervalMinutes: 30,
  minLeadMinutes: 60,
};

export const dayPeriods = [
  { id: "manha", label: "Manhã", from: 0, to: 12 * 60 },
  { id: "tarde", label: "Tarde", from: 12 * 60, to: 18 * 60 },
  { id: "noite", label: "Noite", from: 18 * 60, to: 24 * 60 },
] as const;

export function getService(id: ServiceId | null) {
  return bookingServices.find((service) => service.id === id) ?? null;
}

export function getProfessional(id: string | null) {
  return bookingProfessionals.find((professional) => professional.id === id) ?? null;
}

export function getProfessionalsForService(serviceId: ServiceId) {
  return bookingProfessionals.filter((professional) => professional.serviceIds.includes(serviceId));
}

export function isServiceId(value: unknown): value is ServiceId {
  return bookingServices.some((service) => service.id === value);
}

export function isProfessionalChoice(value: unknown): value is ProfessionalChoice {
  return value === ANY_PROFESSIONAL || bookingProfessionals.some((professional) => professional.id === value);
}

export function offersService(professionalId: ProfessionalChoice, serviceId: ServiceId) {
  if (professionalId === ANY_PROFESSIONAL) return true;
  return servicesByProfessional[professionalId].includes(serviceId);
}

// --- Tipos do rascunho e da reserva ---

export type CustomerDetails = {
  name: string;
  phone: string;
  email: string;
  notes: string;
  /** Consentimento (LGPD) para receber confirmação e lembretes no WhatsApp. Desmarcado por padrão. */
  whatsappOptIn: boolean;
};

/** Resposta da etapa Perfil. "assinante" só é gravado depois do login. */
export type CustomerType = "assinante" | "avulso";

export type BookingDraft = {
  customerType: CustomerType | null;
  serviceId: ServiceId | null;
  professionalId: ProfessionalChoice | null;
  date: string | null;
  time: string | null;
  /** Profissional que atenderá de fato (definido pelo horário quando a escolha é "qualquer"). */
  assignedProfessionalId: ProfessionalId | null;
  /** Preenchido na etapa Dados. Assinantes usam os dados da conta. */
  customer: CustomerDetails;
};

export type TimeSlot = {
  time: string;
  professionalIds: ProfessionalId[];
};

export type DaySummary = {
  date: string;
  status: "open" | "closed" | "full";
  availableCount: number;
};

export type Reservation = {
  code: string;
  status: "confirmado";
  createdAt: string;
  serviceId: ServiceId;
  professionalId: ProfessionalId;
  requestedAnyProfessional: boolean;
  date: string;
  time: string;
  durationMinutes: number;
  price: number;
  customer: CustomerDetails;
  /** Plano do assinante e se o atendimento entra nele. `null` para avulso. */
  plan: { id: PlanId; name: string; covered: boolean } | null;
};

export const emptyCustomer: CustomerDetails = { name: "", phone: "", email: "", notes: "", whatsappOptIn: false };

export const emptyDraft: BookingDraft = {
  customerType: null,
  serviceId: null,
  professionalId: null,
  date: null,
  time: null,
  assignedProfessionalId: null,
  customer: emptyCustomer,
};

// --- Datas (strings YYYY-MM-DD, calculadas em UTC como em painel.ts) ---

function toDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`);
}

export function addDays(isoDate: string, amount: number) {
  const date = toDate(isoDate);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function getWeekday(isoDate: string) {
  return toDate(isoDate).getUTCDay();
}

/** Data local do navegador. Quando houver backend, use o fuso da barbearia. */
export function getTodayIso(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function getMinutesOfDay(now = new Date()) {
  return now.getHours() * 60 + now.getMinutes();
}

export function isWithinBookingWindow(isoDate: string, today: string) {
  return isoDate >= today && isoDate < addDays(today, bookingRules.windowDays);
}

export function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function toTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function getDayPeriod(time: string) {
  const minutes = toMinutes(time);
  return dayPeriods.find((period) => minutes >= period.from && minutes < period.to) ?? dayPeriods[0];
}

const weekdayKeys = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Janela de atendimento do dia, lida de `openingHours` (site.ts). `null` quando fechado. */
export function getOpeningWindow(isoDate: string) {
  const entry = openingHours.find((item) => item.dayOfWeek === weekdayKeys[getWeekday(isoDate)]);
  const [opens, closes] = entry?.hours.split("–") ?? [];
  if (!opens || !closes) return null;
  return { opens: toMinutes(opens), closes: toMinutes(closes) };
}

// --- Formatação ---

const weekdayNames = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const weekdayShortNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const monthNames = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function formatLongDate(isoDate: string) {
  const date = toDate(isoDate);
  return `${weekdayNames[date.getUTCDay()]}, ${date.getUTCDate()} de ${monthNames[date.getUTCMonth()]}`;
}

export function formatShortDate(isoDate: string) {
  const [, month, day] = isoDate.split("-");
  return `${day}/${month}`;
}

export function getDateParts(isoDate: string) {
  const date = toDate(isoDate);
  return {
    weekday: weekdayShortNames[date.getUTCDay()],
    day: String(date.getUTCDate()).padStart(2, "0"),
    month: monthNames[date.getUTCMonth()].slice(0, 3),
  };
}

export function formatSlotLabel(isoDate: string, time: string) {
  return `${getDateParts(isoDate).weekday.toLowerCase()}, ${formatShortDate(isoDate)} às ${time}`;
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

// --- Dados do cliente ---

export const customerLimits = { notesMaxLength: 280 };

export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  const area = digits.slice(0, 2);
  const rest = digits.slice(2);
  const splitAt = digits.length === 11 ? 5 : 4;
  if (rest.length <= splitAt) return `(${area}) ${rest}`;
  return `(${area}) ${rest.slice(0, splitAt)}-${rest.slice(splitAt)}`;
}

export type CustomerTextField = Exclude<keyof CustomerDetails, "whatsappOptIn">;

export type CustomerErrors = Partial<Record<CustomerTextField, string>>;

export function validateCustomer(customer: CustomerDetails): CustomerErrors {
  const errors: CustomerErrors = {};
  const phoneDigits = customer.phone.replace(/\D/g, "");

  if (customer.name.trim().length < 2) errors.name = "Informe seu nome.";
  if (phoneDigits.length < 10) errors.phone = "Informe um telefone com DDD.";
  if (customer.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) {
    errors.email = "Confira o formato do e-mail.";
  }
  if (customer.notes.length > customerLimits.notesMaxLength) {
    errors.notes = `Use até ${customerLimits.notesMaxLength} caracteres.`;
  }

  return errors;
}

export function hasErrors(errors: CustomerErrors) {
  return Object.keys(errors).length > 0;
}
