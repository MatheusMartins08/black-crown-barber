import type { PlanId, SubscriptionPlan } from "./plans";
import type { Professional } from "./professionals";
import type { Service } from "./services";

// Tipos, regras e formatação do painel. Puro (sem React e sem rede): os dados vêm do
// Supabase por app/painel/lib/painel-api.ts. Cobertura do plano, valor cobrado e
// repasse são calculados no banco (appointments_settle e private.plan_coverage) e
// chegam prontos em cada atendimento.

export type AppointmentStatus = "agendado" | "concluido" | "faltou" | "cancelado";
export type Period = "dia" | "semana" | "mes";

export type PaymentMethod = "pix" | "cartao" | "dinheiro";

/**
 * Situação do cliente numa data (private.membership_status no Supabase):
 * - ativo: assinatura vigente e nenhuma mensalidade vencida em aberto;
 * - pendente: mensalidade vencida em aberto, ainda dentro da tolerância (o plano cobre);
 * - atrasado: em aberto há mais dias que a tolerância (o plano deixa de cobrir);
 * - congelado: plano congelado pela barbearia (não cobre e não gera mensalidade);
 * - ex_assinante: sem assinatura vigente, mas já assinou (assinante inativo);
 * - avulso: nunca assinou.
 */
export type MembershipStatus = "ativo" | "pendente" | "atrasado" | "congelado" | "ex_assinante" | "avulso";

/**
 * Um serviço do atendimento (appointment_services), com preço e duração copiados na reserva
 * e, ao concluir, a liquidação dele: o plano cobre serviço a serviço.
 */
export type AppointmentItem = {
  serviceId: string;
  serviceSlug: string;
  serviceName: string;
  price: number;
  durationMinutes: number;
  /** Entrou no plano: o gravado ao concluir ou, em aberto, a cobertura atual. */
  covered: boolean;
  /** Cobrado e repasse deste serviço, gravados ao concluir. `null` enquanto não concluído. */
  charged: number | null;
  payout: number | null;
};

/** Atendimento como o painel enxerga (view appointment_details). */
export type Appointment = {
  id: string;
  code: string;
  date: string;
  time: string;
  clientId: string;
  clientName: string;
  /**
   * Primeiro serviço pelo id (uuid) e slug. O nome é o copiado na reserva, com todos os
   * serviços ("Corte masculino + Sobrancelha"), e não muda se um serviço for renomeado.
   */
  serviceId: string;
  serviceSlug: string;
  serviceName: string;
  /** Serviços do atendimento, na ordem da reserva (1 a 5). */
  items: AppointmentItem[];
  /** Profissionais pelo id (uuid estável); os nomes vêm do cadastro atual, só para exibir. */
  bookedWithId: string;
  bookedWith: string;
  performedById: string;
  performedBy: string;
  status: AppointmentStatus;
  /** Preço total copiado na reserva (soma dos serviços). */
  price: number;
  /** Duração total (soma dos serviços). */
  durationMinutes: number;
  /** Situação do cliente no dia do atendimento. */
  membership: MembershipStatus;
  /** Plano vigente no dia (inclusive congelado). */
  planName: string | null;
  /** O plano cobriu todos os serviços: o snapshot gravado ao concluir ou, em aberto, a cobertura atual. */
  covered: boolean;
  /** Valor cobrado e repasse (somas dos serviços) gravados ao concluir. `null` enquanto não concluído. */
  charged: number | null;
  payout: number | null;
};

/**
 * Mensalidade de um ciclo da assinatura (subscription_payments): um período por mês,
 * ancorado no dia em que o plano começou. Cada ciclo tem a sua linha; os anteriores
 * continuam guardados. "Atrasado" é calculado, não guardado.
 */
export type CyclePayment = {
  id: string;
  clientId: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amount: number;
  status: "pendente" | "pago";
  /** Forma registrada quando pago; pode ser trocada depois. */
  method: PaymentMethod | null;
};

/** Mensalidade do mês, para o quadro de planos. */
export type MonthPayment = {
  id: string;
  planId: PlanId | null;
  amount: number;
  status: "pendente" | "pago" | "cancelado";
};

/** Perfil do cliente (view customer_profiles), com a situação de hoje. */
export type ClientProfile = {
  id: string;
  name: string;
  /** Formatado, ex.: (31) 99999-9999. É o WhatsApp. */
  phone: string;
  whatsappOptIn: boolean;
  membership: MembershipStatus;
  planId: PlanId | null;
  planName: string | null;
  monthlyPrice: number | null;
  subscribedSince: string | null;
  lastSubscriptionEndedAt: string | null;
  openAmount: number;
  oldestDueDate: string | null;
  daysOverdue: number;
  lastPaidAt: string | null;
  lastPaymentMethod: PaymentMethod | null;
  lastPaymentAmount: number | null;
  /** Data do último atendimento concluído (YYYY-MM-DD). */
  lastVisitAt: string | null;
  /** Atendimentos concluídos guardados no banco. */
  visitCount: number;
  /** Mensalidade em aberto mais antiga, a próxima a receber. */
  nextToReceive: CyclePayment | null;
  /** Mensalidade do ciclo que contém hoje (paga ou não). */
  currentCycle: CyclePayment | null;
};

/** Plano pelo nome que a view devolve (live_plan_name), dentro do catálogo do painel. */
export function getPlanByName(plans: readonly SubscriptionPlan[], name: string | null) {
  return plans.find((plan) => plan.name === name) ?? null;
}

/** Dias depois do vencimento em que o plano ainda cobre (shop_settings.subscription_grace_days). */
export const billingRules = { graceDays: 5 };

/** Meses de histórico que o painel consulta (shop_settings.history_retention_months). */
export const historyRules = { months: 6 };

/** O atendimento entrou no plano do cliente? */
export function isCoveredByPlan(appointment: Appointment) {
  return appointment.covered;
}

/** Serviços do atendimento. Sem itens (não deveria acontecer), o próprio atendimento vale como um. */
export function getAppointmentItems(appointment: Appointment): AppointmentItem[] {
  if (appointment.items.length) return appointment.items;
  return [
    {
      serviceId: appointment.serviceId,
      serviceSlug: appointment.serviceSlug,
      serviceName: appointment.serviceName,
      price: appointment.price,
      durationMinutes: appointment.durationMinutes,
      covered: appointment.covered,
      charged: appointment.charged,
      payout: appointment.payout,
    },
  ];
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

/** Valor a cobrar do cliente: o gravado ao concluir ou, em aberto, a previsão (serviços fora do plano). */
export function getServicePrice(appointment: Appointment) {
  if (appointment.charged !== null) return appointment.charged;
  return roundMoney(
    getAppointmentItems(appointment).reduce((sum, item) => sum + (item.covered ? 0 : item.price), 0),
  );
}

/** Repasse ao profissional: só existe depois de concluído (gravado pelo banco). */
export function getPayout(appointment: Appointment) {
  return appointment.status === "concluido" ? appointment.payout ?? 0 : 0;
}

/** Repasse de um serviço do atendimento (só depois de concluído). */
function getItemPayout(appointment: Appointment, item: AppointmentItem) {
  return appointment.status === "concluido" ? item.payout ?? 0 : 0;
}

/** O atendimento tem o serviço (filtro da agenda)? */
export function hasService(appointment: Appointment, serviceId: string) {
  return getAppointmentItems(appointment).some((item) => item.serviceId === serviceId);
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

/** Soma meses como o Postgres (`date + interval`): 31/08 − 6 meses = 28/02. */
export function addMonths(isoDate: string, amount: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return toIsoDate(date);
}

/** Primeira data consultável: hoje menos historyRules.months (06/10 → 06/04). */
export function getHistoryStart(today: string) {
  return addMonths(today, -historyRules.months);
}

export function clampDate(isoDate: string, min: string, max: string) {
  return isoDate < min ? min : isoDate > max ? max : isoDate;
}

/** Meses do histórico (YYYY-MM), do atual para o mais antigo. */
export function listHistoryMonths(today: string) {
  const first = getHistoryStart(today).slice(0, 7);
  const months: string[] = [];
  for (let offset = 0; ; offset -= 1) {
    const month = addMonths(`${today.slice(0, 7)}-01`, offset).slice(0, 7);
    if (month < first) break;
    months.push(month);
  }
  return months;
}

/** Mesma data um período antes ou depois (dia, semana ou mês). */
export function shiftPeriod(isoDate: string, period: Period, direction: -1 | 1) {
  if (period === "dia") return addDays(isoDate, direction);
  if (period === "semana") return addDays(isoDate, direction * 7);
  return addMonths(isoDate, direction);
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

export function formatFullDate(isoDate: string) {
  return isoDate.split("-").reverse().join("/");
}

export function formatMonth(isoDate: string) {
  const date = toDate(isoDate);
  return `${monthNames[date.getUTCMonth()]} de ${date.getUTCFullYear()}`;
}

/** "Outubro de 2026" para um mês YYYY-MM. */
export function formatMonthTitle(month: string) {
  const label = formatMonth(`${month}-01`);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Rótulo do período: "Dia 06/10", "Semana de 05/10 a 11/10" ou "Outubro de 2026". */
export function formatPeriodLabel(isoDate: string, period: Period) {
  if (period === "dia") return `Dia ${formatShortDate(isoDate)}`;

  const range = getPeriodRange(isoDate, period);
  if (period === "semana") return `Semana de ${formatShortDate(range.start)} a ${formatShortDate(range.end)}`;
  return formatMonthTitle(isoDate.slice(0, 7));
}

export function formatCurrency(value: number) {
  const [integer, cents] = value.toFixed(2).split(".");
  // Espaço não separável: "R$" nunca fica sozinho no fim da linha.
  return `R$\u00a0${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents}`;
}

export type BarberSummary = {
  professionalId: string;
  barberName: string;
  specialty: string;
  /** Atendimentos concluídos (clientes atendidos): um por agendamento, com qualquer número de serviços. */
  completed: number;
  booked: number;
  /** Serviços feitos nos atendimentos concluídos (id do serviço → quantidade). */
  byService: Record<string, number>;
  /** Serviços concluídos cobertos pelo plano e avulsos (cada serviço conta um). */
  planCount: number;
  walkInCount: number;
  planPayout: number;
  walkInPayout: number;
  total: number;
};

/**
 * Profissionais que entram na agenda e no fechamento: os ativos e, mesmo inativos ou
 * excluídos, os que executaram algum atendimento da lista. Como a lista é a do período
 * consultado (dia, semana ou mês), um excluído aparece só nos períodos em que atendeu.
 */
export function listProfessionalsFor(professionals: readonly Professional[], appointments: readonly Appointment[]) {
  const performers = new Set(appointments.map((appointment) => appointment.performedById));
  return professionals.filter((professional) => professional.isActive || performers.has(professional.id));
}

/**
 * Serviços que entram como colunas da agenda e do fechamento: os ativos e, mesmo inativos
 * ou excluídos, os que aparecem nos atendimentos da lista (o histórico continua visível).
 */
export function listServicesFor(services: readonly Service[], appointments: readonly Appointment[]) {
  const used = new Set(appointments.flatMap((appointment) => getAppointmentItems(appointment).map((item) => item.serviceId)));
  return services.filter((service) => (service.isActive && !service.deletedAt) || used.has(service.id));
}

/**
 * Resumo por profissional considerando quem executou o serviço (não com quem foi marcado).
 * Atendidos contam agendamentos; colunas por serviço, plano/avulso e repasses contam serviços.
 */
export function summarizeByBarber(
  appointments: Appointment[],
  professionals: readonly Professional[],
  services: readonly Service[],
): BarberSummary[] {
  const columns = listServicesFor(services, appointments);
  return listProfessionalsFor(professionals, appointments).map((professional) => {
    const own = appointments.filter((appointment) => appointment.performedById === professional.id);
    const completed = own.filter((appointment) => appointment.status === "concluido");
    const byService: Record<string, number> = Object.fromEntries(columns.map((service) => [service.id, 0]));
    let planCount = 0;
    let walkInCount = 0;
    let planPayout = 0;
    let walkInPayout = 0;

    for (const appointment of completed) {
      for (const item of getAppointmentItems(appointment)) {
        byService[item.serviceId] = (byService[item.serviceId] ?? 0) + 1;
        if (item.covered) {
          planCount += 1;
          planPayout += getItemPayout(appointment, item);
        } else {
          walkInCount += 1;
          walkInPayout += getItemPayout(appointment, item);
        }
      }
    }

    return {
      professionalId: professional.id,
      barberName: professional.name,
      specialty: professional.specialty,
      completed: completed.length,
      booked: own.filter((appointment) => appointment.status !== "cancelado").length,
      byService,
      planCount,
      walkInCount,
      planPayout: roundMoney(planPayout),
      walkInPayout: roundMoney(walkInPayout),
      total: roundMoney(planPayout + walkInPayout),
    };
  });
}
