import { barbers, services } from "./site";

// Dados ilustrativos do painel. Tudo é gerado de forma determinística (mesma
// semente no servidor e no navegador) até o painel ler o Supabase. As regras de
// assinatura e mensalidade espelham supabase/migrations/…120800_memberships.sql.

export type BarberName = (typeof barbers)[number]["name"];
export type ServiceName = (typeof services)[number]["name"];
export type AppointmentStatus = "agendado" | "concluido" | "faltou" | "cancelado";
export type Period = "dia" | "semana" | "mes";

export type SubscriptionPlan = {
  id: string;
  name: string;
  monthlyPrice: number;
  covers: readonly ServiceName[];
};

/** O telefone do cliente é o WhatsApp. */
export type Client = {
  id: string;
  name: string;
  phone: string;
  whatsappOptIn: boolean;
};

export type Subscription = {
  id: string;
  clientId: string;
  planId: string;
  startedAt: string;
  /** Último dia coberto. `null` enquanto ativa. */
  endedAt: string | null;
};

export type PaymentMethod = "pix" | "cartao" | "dinheiro";

/** Mensalidade pré-paga: vence no primeiro dia do período. "Atrasado" é calculado, não guardado. */
export type PlanPayment = {
  id: string;
  subscriptionId: string;
  periodStart: string;
  dueDate: string;
  amount: number;
  status: "pendente" | "pago";
  paidAt: string | null;
  method: PaymentMethod | null;
};

/**
 * Situação do cliente numa data. Mesma regra de private.membership_status no Supabase:
 * - ativo: assinatura vigente e nenhuma mensalidade vencida em aberto;
 * - pendente: mensalidade vencida em aberto, ainda dentro da tolerância (o plano cobre);
 * - atrasado: em aberto há mais dias que a tolerância (o plano deixa de cobrir);
 * - ex_assinante: sem assinatura vigente, mas já assinou;
 * - avulso: nunca assinou.
 */
export type MembershipStatus = "ativo" | "pendente" | "atrasado" | "ex_assinante" | "avulso";

export type Appointment = {
  id: string;
  date: string;
  time: string;
  clientId: string;
  serviceName: ServiceName;
  bookedWith: BarberName;
  performedBy: BarberName;
  status: AppointmentStatus;
};

export const referenceDate = "2026-10-03";
const referenceTime = "14:00";
const dataStart = "2026-09-01";
const dataEnd = "2026-10-10";

export const dataRange = { start: dataStart, end: dataEnd };

export const barberNames = barbers.map((barber) => barber.name) as BarberName[];
export const serviceNames = services.map((service) => service.name) as ServiceName[];

export const servicePrices: Record<ServiceName, number> = {
  "Corte masculino": 55,
  Barba: 45,
  "Corte + barba": 90,
  Sobrancelha: 25,
};

const serviceSlots: Record<ServiceName, number> = {
  "Corte masculino": 1,
  Barba: 1,
  "Corte + barba": 2,
  Sobrancelha: 1,
};

export const subscriptionPlans: SubscriptionPlan[] = [
  { id: "plano-corte", name: "Plano Corte", monthlyPrice: 99, covers: ["Corte masculino"] },
  { id: "plano-barba", name: "Plano Barba", monthlyPrice: 89, covers: ["Barba"] },
  {
    id: "plano-coroa",
    name: "Plano Coroa",
    monthlyPrice: 169,
    covers: ["Corte masculino", "Barba", "Corte + barba"],
  },
];

// Regras de repasse ilustrativas: ajuste aqui quando a barbearia definir os valores reais.
export const commissionRules = {
  walkInRate: 0.5,
  planPayout: {
    "Corte masculino": 22,
    Barba: 18,
    "Corte + barba": 35,
    Sobrancelha: 10,
  } satisfies Record<ServiceName, number>,
};

const clientNames = [
  "André Souza", "Bruno Lacerda", "Caio Ferreira", "Daniel Rocha", "Eduardo Pires",
  "Felipe Moura", "Gabriel Antunes", "Henrique Dias", "Igor Matos", "Jorge Teixeira",
  "Kauã Ribeiro", "Leonardo Prado", "Marcos Vieira", "Nathan Coelho", "Otávio Lima",
  "Paulo Henrique Brandão", "Rafael Quintão", "Samuel Arantes", "Thiago Moreira", "Ulisses Faria",
  "Vinícius Castro", "Wagner Nogueira", "Yuri Campos", "Lucas Gontijo", "Mateus Drummond",
  "Pedro Bicalho", "Ricardo Lanna", "Gustavo Rezende",
];

export const clients: Client[] = clientNames.map((name, index) => ({
  id: `cli-${String(index + 1).padStart(2, "0")}`,
  name,
  phone: `(31) 9${String(8100 + index * 37).padStart(4, "0")}-${String(1000 + index * 263).slice(-4)}`,
  whatsappOptIn: index % 3 !== 2,
}));

const clientsById = new Map(clients.map((client) => [client.id, client]));
const plansById = new Map(subscriptionPlans.map((plan) => [plan.id, plan]));

export function getClient(clientId: string) {
  return clientsById.get(clientId)!;
}

export function getPlan(planId: string | null) {
  return planId ? plansById.get(planId) ?? null : null;
}

// --- Assinaturas e mensalidades ---

/** Dias depois do vencimento em que o plano ainda cobre (shop_settings.subscription_grace_days). */
export const billingRules = { graceDays: 5 };

// Base ilustrativa (índice em clientNames). `paidThrough`: mensalidades com vencimento
// até essa data estão pagas; as seguintes ficam em aberto. Padrão: tudo pago até hoje.
const subscriptionSeeds: {
  client: number;
  planId: string;
  startedAt: string;
  endedAt?: string;
  paidThrough?: string;
}[] = [
  { client: 0, planId: "plano-coroa", startedAt: "2026-02-14" },
  { client: 2, planId: "plano-corte", startedAt: "2026-05-08" },
  { client: 4, planId: "plano-barba", startedAt: "2026-07-22" },
  // Vencida há 3 dias: pagamento pendente, ainda dentro da tolerância.
  { client: 5, planId: "plano-coroa", startedAt: "2026-04-30", paidThrough: "2026-09-29" },
  { client: 8, planId: "plano-corte", startedAt: "2026-06-03" },
  { client: 10, planId: "plano-coroa", startedAt: "2025-12-18" },
  // Vencida em 20/09: passou da tolerância, o plano deixa de cobrir a partir de 26/09.
  { client: 13, planId: "plano-barba", startedAt: "2026-06-20", paidThrough: "2026-09-19" },
  { client: 15, planId: "plano-corte", startedAt: "2026-08-11" },
  { client: 18, planId: "plano-coroa", startedAt: "2026-03-27" },
  // Vencida em 01/10: pendente.
  { client: 20, planId: "plano-corte", startedAt: "2026-03-01", paidThrough: "2026-09-30" },
  { client: 23, planId: "plano-barba", startedAt: "2026-01-09" },
  { client: 25, planId: "plano-coroa", startedAt: "2026-08-25" },
  // Ex-assinantes.
  { client: 1, planId: "plano-coroa", startedAt: "2026-01-10", endedAt: "2026-07-09" },
  { client: 6, planId: "plano-corte", startedAt: "2026-03-15", endedAt: "2026-08-14" },
  { client: 11, planId: "plano-barba", startedAt: "2025-11-05", endedAt: "2026-05-04" },
  // Cancelou em setembro deixando a última mensalidade em aberto.
  { client: 16, planId: "plano-coroa", startedAt: "2026-05-12", endedAt: "2026-09-11", paidThrough: "2026-08-11" },
];

export const subscriptions: Subscription[] = subscriptionSeeds.map((seed, index) => ({
  id: `ass-${String(index + 1).padStart(2, "0")}`,
  clientId: clients[seed.client].id,
  planId: seed.planId,
  startedAt: seed.startedAt,
  endedAt: seed.endedAt ?? null,
}));

const paymentMethods: PaymentMethod[] = ["pix", "pix", "cartao", "dinheiro"];

/** Gera as mensalidades até o fim dos dados, como private.generate_subscription_payments. */
function generatePayments() {
  const generated: PlanPayment[] = [];

  subscriptionSeeds.forEach((seed, index) => {
    const subscription = subscriptions[index];
    const plan = getPlan(subscription.planId)!;
    const lastStart = subscription.endedAt && subscription.endedAt < dataEnd ? subscription.endedAt : dataEnd;
    const paidThrough = seed.paidThrough ?? referenceDate;

    for (let month = 0; ; month++) {
      const periodStart = addMonths(subscription.startedAt, month);
      if (periodStart > lastStart) break;
      const paid = periodStart <= paidThrough;

      generated.push({
        id: `${subscription.id}-${periodStart}`,
        subscriptionId: subscription.id,
        periodStart,
        dueDate: periodStart,
        amount: plan.monthlyPrice,
        status: paid ? "pago" : "pendente",
        paidAt: paid ? periodStart : null,
        method: paid ? paymentMethods[(index + month) % paymentMethods.length] : null,
      });
    }
  });

  return generated;
}

export const initialPayments = generatePayments();

/** Assinatura vigente do cliente na data. */
export function getSubscriptionOn(clientId: string, date: string) {
  return (
    subscriptions.find(
      (subscription) =>
        subscription.clientId === clientId &&
        subscription.startedAt <= date &&
        (subscription.endedAt === null || subscription.endedAt >= date),
    ) ?? null
  );
}

/** Mensalidades vencidas e em aberto até a data, da mais antiga para a mais recente. */
export function getOpenPayments(subscriptionIds: string[], date: string, payments: PlanPayment[]) {
  return payments
    .filter(
      (payment) =>
        subscriptionIds.includes(payment.subscriptionId) && payment.status === "pendente" && payment.dueDate <= date,
    )
    .sort((first, second) => first.dueDate.localeCompare(second.dueDate));
}

function isInGoodStanding(subscriptionId: string, date: string, payments: PlanPayment[]) {
  const limit = addDays(date, -billingRules.graceDays);
  return !payments.some(
    (payment) => payment.subscriptionId === subscriptionId && payment.status === "pendente" && payment.dueDate < limit,
  );
}

export function getMembership(clientId: string, date: string, payments: PlanPayment[]): MembershipStatus {
  const current = getSubscriptionOn(clientId, date);

  if (current) {
    if (!isInGoodStanding(current.id, date, payments)) return "atrasado";
    return getOpenPayments([current.id], date, payments).length ? "pendente" : "ativo";
  }

  const hasSubscribed = subscriptions.some(
    (subscription) => subscription.clientId === clientId && subscription.startedAt <= date,
  );
  return hasSubscribed ? "ex_assinante" : "avulso";
}

/** Plano que cobre o serviço na data: vigente, inclui o serviço e em dia (dentro da tolerância). */
export function getCoveringPlan(clientId: string, serviceName: ServiceName, date: string, payments: PlanPayment[]) {
  const current = getSubscriptionOn(clientId, date);
  if (!current || !isInGoodStanding(current.id, date, payments)) return null;
  const plan = getPlan(current.planId);
  return plan?.covers.includes(serviceName) ? plan : null;
}

/** O atendimento é coberto pelo plano do cliente? Assinantes pagam à parte serviços fora do plano. */
export function isCoveredByPlan(appointment: Appointment, payments: PlanPayment[]) {
  return getCoveringPlan(appointment.clientId, appointment.serviceName, appointment.date, payments) !== null;
}

export function getServicePrice(appointment: Appointment, payments: PlanPayment[]) {
  return isCoveredByPlan(appointment, payments) ? 0 : servicePrices[appointment.serviceName];
}

export function getPayout(appointment: Appointment, payments: PlanPayment[]) {
  if (appointment.status !== "concluido") return 0;
  return isCoveredByPlan(appointment, payments)
    ? commissionRules.planPayout[appointment.serviceName]
    : servicePrices[appointment.serviceName] * commissionRules.walkInRate;
}

export type ClientProfile = {
  client: Client;
  membership: MembershipStatus;
  subscription: Subscription | null;
  plan: SubscriptionPlan | null;
  /** Assinatura mais recente já encerrada (para ex-assinantes). */
  lastEnded: Subscription | null;
  openPayments: PlanPayment[];
  openAmount: number;
  daysOverdue: number;
  lastPayment: PlanPayment | null;
};

/** Perfil do cliente na data (equivale à view customer_profiles). */
export function getClientProfile(client: Client, date: string, payments: PlanPayment[]): ClientProfile {
  const own = subscriptions.filter((subscription) => subscription.clientId === client.id && subscription.startedAt <= date);
  const subscription = getSubscriptionOn(client.id, date);
  const ownIds = own.map((item) => item.id);
  const openPayments = getOpenPayments(ownIds, date, payments);
  const lastPayment =
    payments
      .filter((payment) => ownIds.includes(payment.subscriptionId) && payment.status === "pago" && payment.paidAt! <= date)
      .sort((first, second) => second.paidAt!.localeCompare(first.paidAt!))[0] ?? null;
  const lastEnded =
    own
      .filter((item) => item.endedAt !== null && item.endedAt < date)
      .sort((first, second) => second.endedAt!.localeCompare(first.endedAt!))[0] ?? null;

  return {
    client,
    membership: getMembership(client.id, date, payments),
    subscription,
    plan: getPlan(subscription?.planId ?? lastEnded?.planId ?? null),
    lastEnded,
    openPayments,
    openAmount: openPayments.reduce((sum, payment) => sum + payment.amount, 0),
    daysOverdue: openPayments.length ? daysBetween(openPayments[0].dueDate, date) : 0,
    lastPayment,
  };
}

// --- Datas (strings YYYY-MM-DD, calculadas em UTC para não depender do fuso) ---

function toDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`);
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, amount: number) {
  const date = toDate(isoDate);
  date.setUTCDate(date.getUTCDate() + amount);
  return toIsoDate(date);
}

/** Soma meses mantendo o dia; quando o mês é mais curto, usa o último dia (31/01 + 1 = 28/02), como o Postgres. */
export function addMonths(isoDate: string, amount: number) {
  const date = toDate(isoDate);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return toIsoDate(date);
}

export function daysBetween(from: string, to: string) {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}

export function getWeekday(isoDate: string) {
  return toDate(isoDate).getUTCDay();
}

export function getPeriodRange(isoDate: string, period: Period) {
  if (period === "dia") return { start: isoDate, end: isoDate };

  if (period === "semana") {
    const offsetToMonday = (getWeekday(isoDate) + 6) % 7;
    const start = addDays(isoDate, -offsetToMonday);
    return { start, end: addDays(start, 6) };
  }

  const start = `${isoDate.slice(0, 8)}01`;
  const nextMonth = toDate(start);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  return { start, end: addDays(toIsoDate(nextMonth), -1) };
}

const weekdayNames = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
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

export function formatMonth(isoDate: string) {
  const date = toDate(isoDate);
  return `${monthNames[date.getUTCMonth()]} de ${date.getUTCFullYear()}`;
}

export function formatCurrency(value: number) {
  const [integer, cents] = value.toFixed(2).split(".");
  return `R$ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents}`;
}

// --- Geração da agenda ilustrativa ---

const closingHourByWeekday: Record<number, number | null> = {
  0: null,
  1: 20,
  2: 20,
  3: 20,
  4: 20,
  5: 21,
  6: 18,
};

function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pickService(random: () => number): ServiceName {
  const roll = random();
  if (roll < 0.38) return "Corte masculino";
  if (roll < 0.6) return "Barba";
  if (roll < 0.88) return "Corte + barba";
  return "Sobrancelha";
}

function toTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function getStatus(date: string, time: string, random: () => number): AppointmentStatus {
  const isPast = date < referenceDate || (date === referenceDate && time < referenceTime);
  const roll = random();

  if (!isPast) return roll < 0.04 ? "cancelado" : "agendado";
  if (roll < 0.05) return "faltou";
  if (roll < 0.09) return "cancelado";
  return "concluido";
}

function generateAppointments() {
  const random = createRandom(20261003);
  const generated: Appointment[] = [];
  const occupancyByBarber: Record<string, number> = {
    "Júlia Andrade": 0.72,
    "Rafael Martins": 0.62,
    "João Almeida": 0.5,
  };

  for (let date = dataStart; date <= dataEnd; date = addDays(date, 1)) {
    const closingHour = closingHourByWeekday[getWeekday(date)];
    if (closingHour === null) continue;

    for (const barberName of barberNames) {
      let minutes = 9 * 60;

      while (minutes < closingHour * 60 - 30) {
        if (random() > occupancyByBarber[barberName]) {
          minutes += 30;
          continue;
        }

        const serviceName = pickService(random);
        const time = toTime(minutes);
        const client = clients[Math.floor(random() * clients.length)];
        const reassigned = random() < 0.06;
        const performedBy = reassigned
          ? barberNames[(barberNames.indexOf(barberName) + 1) % barberNames.length]
          : barberName;

        generated.push({
          id: `ag-${generated.length + 1}`,
          date,
          time,
          clientId: client.id,
          serviceName,
          bookedWith: barberName,
          performedBy,
          status: getStatus(date, time, random),
        });

        minutes += serviceSlots[serviceName] * 30;
      }
    }
  }

  return generated.sort((first, second) =>
    first.date === second.date ? first.time.localeCompare(second.time) : first.date.localeCompare(second.date),
  );
}

export const initialAppointments = generateAppointments();

export type BarberSummary = {
  barberName: BarberName;
  completed: number;
  booked: number;
  byService: Record<ServiceName, number>;
  planCount: number;
  walkInCount: number;
  planPayout: number;
  walkInPayout: number;
  total: number;
};

/** Resumo por profissional considerando quem executou o serviço (não com quem foi marcado). */
export function summarizeByBarber(appointments: Appointment[], payments: PlanPayment[]): BarberSummary[] {
  return barberNames.map((barberName) => {
    const own = appointments.filter((appointment) => appointment.performedBy === barberName);
    const completed = own.filter((appointment) => appointment.status === "concluido");
    const byService = Object.fromEntries(serviceNames.map((name) => [name, 0])) as Record<ServiceName, number>;
    let planCount = 0;
    let planPayout = 0;
    let walkInPayout = 0;

    for (const appointment of completed) {
      byService[appointment.serviceName] += 1;
      if (isCoveredByPlan(appointment, payments)) {
        planCount += 1;
        planPayout += getPayout(appointment, payments);
      } else {
        walkInPayout += getPayout(appointment, payments);
      }
    }

    return {
      barberName,
      completed: completed.length,
      booked: own.filter((appointment) => appointment.status !== "cancelado").length,
      byService,
      planCount,
      walkInCount: completed.length - planCount,
      planPayout,
      walkInPayout,
      total: planPayout + walkInPayout,
    };
  });
}
