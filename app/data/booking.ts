import type { PlanId } from "./plans";
import type { Professional } from "./professionals";
import type { Service } from "./services";

// Regras e dados do fluxo de agendamento. Tudo aqui é puro (sem React e sem rede)
// para poder ser reaproveitado no servidor quando existir uma API de agenda.

/** Slug do serviço (services.slug), o mesmo que as RPCs do agendamento recebem. */
export type ServiceId = string;
/** Slug do profissional (professionals.slug), o mesmo que as RPCs do agendamento recebem. */
export type ProfessionalId = string;

export const ANY_PROFESSIONAL = "qualquer";
export type ProfessionalChoice = ProfessionalId | typeof ANY_PROFESSIONAL;

/** Serviço como o agendamento usa: o mesmo do catálogo (Supabase), só os ativos. */
export type BookingService = Service;

// Serviços: vêm do Supabase (só os ativos) e chegam ao fluxo por props/contexto.

export function getService(services: readonly Service[], slug: ServiceId | null) {
  return services.find((service) => service.slug === slug) ?? null;
}

export function isServiceId(services: readonly Service[], value: unknown): value is ServiceId {
  return services.some((service) => service.slug === value);
}

// --- Vários serviços no mesmo agendamento ---
// As mesmas regras de private.resolve_services: de 1 a 5 serviços, sem repetir e sem dois
// serviços que cubram o mesmo serviço simples (Corte + "Corte + barba"). O banco confere de novo.

export const maxServicesPerBooking = 5;

/** Serviços escolhidos, na ordem da escolha (ignora o que saiu do catálogo). */
export function getServices(services: readonly Service[], slugs: readonly ServiceId[]) {
  return slugs.flatMap((slug) => {
    const service = getService(services, slug);
    return service ? [service] : [];
  });
}

/** Serviços simples que o serviço cobre: as partes de um combo, ou ele mesmo. */
function getBaseIds(service: Pick<Service, "id" | "components">) {
  return service.components.length ? service.components : [service.id];
}

/** Serviços já escolhidos que cobrem algo que o candidato também cobre. */
export function findServiceConflicts(services: readonly Service[], selected: readonly ServiceId[], candidate: ServiceId) {
  const target = getService(services, candidate);
  if (!target) return [];
  const bases = new Set(getBaseIds(target));
  return getServices(services, selected).filter(
    (service) => service.slug !== candidate && getBaseIds(service).some((id) => bases.has(id)),
  );
}

/** A seleção é aceita pelo banco? (tamanho, repetição e combos) */
export function isValidServiceSelection(services: readonly Service[], slugs: readonly ServiceId[]) {
  if (!slugs.length || slugs.length > maxServicesPerBooking || new Set(slugs).size !== slugs.length) return false;
  if (getServices(services, slugs).length !== slugs.length) return false;
  return slugs.every((slug, index) => !findServiceConflicts(services, slugs.slice(0, index), slug).length);
}

/** Troca os serviços em conflito pelo candidato (botão "Substituir"). */
export function replaceConflictingServices(
  services: readonly Service[],
  selected: readonly ServiceId[],
  candidate: ServiceId,
): ServiceId[] {
  const conflicts = new Set(findServiceConflicts(services, selected, candidate).map((service) => service.slug));
  return [...selected.filter((slug) => !conflicts.has(slug)), candidate];
}

function joinNames(list: readonly Pick<Service, "name">[]) {
  const names = list.map((service) => service.name);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}` : (names[0] ?? "");
}

/** "Corte + barba já inclui Corte masculino." / "Barba já está incluída em Corte + barba." */
export function describeServiceConflict(candidate: Pick<Service, "id" | "name" | "components">, conflicts: readonly Service[]) {
  if (conflicts.every((service) => candidate.components.includes(service.id))) {
    return `${candidate.name} já inclui ${joinNames(conflicts)}.`;
  }
  if (conflicts.length === 1 && conflicts[0].components.includes(candidate.id)) {
    return `${candidate.name} já faz parte de ${conflicts[0].name}.`;
  }
  return `${candidate.name} tem serviços em comum com ${joinNames(conflicts)}.`;
}

/** Duração e preço do atendimento: a soma dos serviços. */
export function sumServices(list: readonly Pick<Service, "durationMinutes" | "price">[]) {
  return list.reduce(
    (total, service) => ({
      durationMinutes: total.durationMinutes + service.durationMinutes,
      price: Math.round((total.price + service.price) * 100) / 100,
    }),
    { durationMinutes: 0, price: 0 },
  );
}

/** "Corte masculino + Sobrancelha" (o mesmo nome que o banco grava no atendimento). */
export function describeServices(list: readonly Pick<Service, "name">[]) {
  return list.map((service) => service.name).join(" + ");
}

// Profissionais: vêm do Supabase (só os ativos) e chegam ao fluxo por props/contexto.
// As funções abaixo recebem a lista em vez de ler um catálogo fixo.

export function getProfessional(professionals: readonly Professional[], slug: string | null) {
  return professionals.find((professional) => professional.slug === slug) ?? null;
}

/** Profissionais que atendem todos os serviços escolhidos. */
export function getProfessionalsForServices(professionals: readonly Professional[], serviceIds: readonly ServiceId[]) {
  return professionals.filter((professional) => serviceIds.every((id) => professional.serviceIds.includes(id)));
}

export function isProfessionalChoice(
  professionals: readonly Professional[],
  value: unknown,
): value is ProfessionalChoice {
  return value === ANY_PROFESSIONAL || professionals.some((professional) => professional.slug === value);
}

/** O profissional atende todos os serviços? "Qualquer profissional" sempre vale. */
export function offersServices(
  professionals: readonly Professional[],
  professionalId: ProfessionalChoice,
  serviceIds: readonly ServiceId[],
) {
  if (professionalId === ANY_PROFESSIONAL) return true;
  const professional = getProfessional(professionals, professionalId);
  return professional ? serviceIds.every((id) => professional.serviceIds.includes(id)) : false;
}

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

// --- Tipos do rascunho e da reserva ---

export type CustomerDetails = {
  name: string;
  phone: string;
  email: string;
  /** Consentimento (LGPD) para receber confirmação e lembretes no WhatsApp. Desmarcado por padrão. */
  whatsappOptIn: boolean;
};

/** Resposta da etapa Perfil. "assinante" só é gravado depois do login. */
export type CustomerType = "assinante" | "avulso";

export type BookingDraft = {
  customerType: CustomerType | null;
  /** Serviços escolhidos, na ordem da escolha (1 a 5). */
  serviceIds: ServiceId[];
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

/** Serviço da reserva, com os valores copiados no momento do agendamento. */
export type ReservationService = {
  id: ServiceId;
  name: string;
  price: number;
  durationMinutes: number;
  /** Só na reserva do assinante: o plano cobre este serviço. */
  covered?: boolean;
};

export type Reservation = {
  code: string;
  status: "confirmado";
  createdAt: string;
  /** Primeiro serviço (compatibilidade). A lista completa está em `services`. */
  serviceId: ServiceId;
  services: ReservationService[];
  professionalId: ProfessionalId;
  requestedAnyProfessional: boolean;
  date: string;
  time: string;
  /** Duração total (soma dos serviços). */
  durationMinutes: number;
  /** Preço total (soma dos serviços). */
  price: number;
  customer: CustomerDetails;
  /** Plano do assinante e se todos os serviços entram nele. `null` para avulso. */
  plan: { id: PlanId; name: string; covered: boolean } | null;
};

export const emptyCustomer: CustomerDetails = { name: "", phone: "", email: "", whatsappOptIn: false };

export const emptyDraft: BookingDraft = {
  customerType: null,
  serviceIds: [],
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

const wholeFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const centsFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

/** R$ 55 para valores inteiros; R$ 60,50 com centavos (nunca "R$ 60,5"). */
export function formatCurrency(value: number) {
  return (Number.isInteger(value) ? wholeFormatter : centsFormatter).format(value);
}

// --- Dados do cliente ---

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

  return errors;
}

export function hasErrors(errors: CustomerErrors) {
  return Object.keys(errors).length > 0;
}
