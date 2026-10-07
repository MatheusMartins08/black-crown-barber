import { formatPhone, getTodayIso } from "../../data/booking";
import {
  addDays,
  type Appointment,
  type AppointmentStatus,
  type BarberName,
  type ClientProfile,
  type MembershipStatus,
  type MonthPayment,
  type CyclePayment,
  type PaymentMethod,
  type ServiceName,
} from "../../data/painel";
import { isPlanId } from "../../data/plans";
import { barbers, services } from "../../data/site";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { getRpcMessage, type RpcError } from "../../lib/supabase/errors";

// As mensalidades só são geradas até hoje (private.generate_subscription_payments), então
// toda mensalidade "pendente" já venceu.
//
// Dados do painel no Supabase, com a sessão da equipe (cookie) e a RLS valendo:
// barbeiros leem tudo e só alteram status e executor dos próprios horários; registrar
// mensalidade é só do admin. Cobertura, cobrado e repasse vêm calculados pelo banco.

export class PainelApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PainelApiError";
  }
}

function fail(error: RpcError, fallback: string): never {
  throw new PainelApiError(error.code === "42501" ? "Seu usuário não tem permissão para esta ação." : getRpcMessage(error, fallback));
}

const barberNameBySlug = Object.fromEntries(barbers.map((barber) => [barber.id, barber.name])) as Record<string, BarberName>;
const serviceNameBySlug = Object.fromEntries(services.map((service) => [service.id, service.name])) as Record<
  string,
  ServiceName
>;

type AppointmentRow = {
  id: string;
  code: string;
  status: AppointmentStatus;
  local_date: string;
  local_time: string;
  customer_id: string;
  customer_name: string;
  service_slug: string;
  service_name: string;
  booked_professional_slug: string;
  booked_professional_name: string;
  performed_by_slug: string;
  performed_by_name: string;
  price: number;
  live_plan_name: string | null;
  covered_live: boolean;
  covered_by_plan: boolean | null;
  charged_amount: number | null;
  payout_amount: number | null;
  membership_status: MembershipStatus;
};

const appointmentColumns =
  "id, code, status, local_date, local_time, customer_id, customer_name, service_slug, service_name, booked_professional_slug, booked_professional_name, performed_by_slug, performed_by_name, price, live_plan_name, covered_live, covered_by_plan, charged_amount, payout_amount, membership_status";

function toAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    code: row.code,
    date: row.local_date,
    time: row.local_time,
    clientId: row.customer_id,
    clientName: row.customer_name,
    serviceName: serviceNameBySlug[row.service_slug] ?? (row.service_name as ServiceName),
    bookedWith: barberNameBySlug[row.booked_professional_slug] ?? (row.booked_professional_name as BarberName),
    performedBy: barberNameBySlug[row.performed_by_slug] ?? (row.performed_by_name as BarberName),
    status: row.status,
    price: Number(row.price),
    membership: row.membership_status,
    planName: row.live_plan_name,
    covered: row.covered_by_plan ?? row.covered_live,
    charged: row.charged_amount === null ? null : Number(row.charged_amount),
    payout: row.payout_amount === null ? null : Number(row.payout_amount),
  };
}

/**
 * Atendimentos entre duas datas (inclusive), no fuso da barbearia. O filtro exato é por
 * local_date; o de starts_at, com um dia de folga para cada lado (cobre qualquer fuso),
 * só deixa o banco usar o índice de starts_at antes de calcular as colunas da view.
 */
export async function fetchAppointments(range: { start: string; end: string }): Promise<Appointment[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("appointment_details")
    .select(appointmentColumns)
    .gte("starts_at", `${addDays(range.start, -1)}T00:00:00Z`)
    .lt("starts_at", `${addDays(range.end, 2)}T00:00:00Z`)
    .gte("local_date", range.start)
    .lte("local_date", range.end)
    .order("starts_at");
  if (error) fail(error, "Não foi possível carregar a agenda.");
  return (data as AppointmentRow[]).map(toAppointment);
}

async function fetchAppointment(id: string) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("appointment_details")
    .select(appointmentColumns)
    .eq("id", id)
    .single();
  if (error) fail(error, "Não foi possível recarregar o atendimento.");
  return toAppointment(data as AppointmentRow);
}

let professionalIds: Promise<Record<string, string>> | null = null;

function getProfessionalIds() {
  professionalIds ??= (async () => {
    const { data, error } = await getSupabaseBrowserClient().from("professionals").select("id, slug");
    if (error) {
      professionalIds = null;
      fail(error, "Não foi possível carregar a equipe.");
    }
    return Object.fromEntries(data.map((row) => [row.slug, row.id]));
  })();
  return professionalIds;
}

/** Altera status e/ou quem executou. Devolve o atendimento como o banco gravou (com cobrado e repasse). */
export async function updateAppointment(
  id: string,
  changes: Partial<Pick<Appointment, "status" | "performedBy">>,
): Promise<Appointment> {
  const patch: { status?: AppointmentStatus; performed_by_id?: string } = {};
  if (changes.status) patch.status = changes.status;
  if (changes.performedBy) {
    const slug = barbers.find((barber) => barber.name === changes.performedBy)?.id;
    const professionalId = slug ? (await getProfessionalIds())[slug] : undefined;
    if (!professionalId) throw new PainelApiError("Profissional não encontrado.");
    patch.performed_by_id = professionalId;
  }

  const { data, error } = await getSupabaseBrowserClient().from("appointments").update(patch).eq("id", id).select("id");
  if (error) {
    if (error.code === "23P01") throw new PainelApiError("Esse profissional já tem atendimento nesse horário.");
    fail(error, "Não foi possível salvar a alteração.");
  }
  if (!data?.length) throw new PainelApiError("Você só pode alterar os seus próprios horários.");
  return fetchAppointment(id);
}

type ProfileRow = {
  id: string;
  name: string;
  phone: string;
  whatsapp_opt_in: boolean;
  membership_status: MembershipStatus;
  plan_slug: string | null;
  plan_name: string | null;
  monthly_price: number | null;
  subscribed_since: string | null;
  last_subscription_ended_at: string | null;
  open_amount: number;
  oldest_due_date: string | null;
  days_overdue: number | null;
  last_paid_at: string | null;
  last_payment_method: PaymentMethod | null;
  last_payment_amount: number | null;
  last_visit_at: string | null;
  visit_count: number;
};

type CyclePaymentRow = {
  id: string;
  period_start: string;
  period_end: string;
  due_date: string;
  amount: number;
  status: CyclePayment["status"];
  method: PaymentMethod | null;
  customer_subscriptions: { customer_id: string } | null;
};

const cyclePaymentColumns =
  "id, period_start, period_end, due_date, amount, status, method, customer_subscriptions!inner(customer_id)";

function toCyclePayment(row: CyclePaymentRow, clientId: string): CyclePayment {
  return {
    id: row.id,
    clientId,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    dueDate: row.due_date,
    amount: Number(row.amount),
    status: row.status,
    method: row.method,
  };
}

/**
 * Perfis de todos os clientes com a mensalidade em aberto mais antiga e a do ciclo atual
 * (a que contém hoje, paga ou não) de cada um.
 */
export async function fetchClientProfiles(): Promise<ClientProfile[]> {
  const supabase = getSupabaseBrowserClient();
  const today = getTodayIso();
  const [profiles, open, current] = await Promise.all([
    supabase
      .from("customer_profiles")
      .select(
        "id, name, phone, whatsapp_opt_in, membership_status, plan_slug, plan_name, monthly_price, subscribed_since, last_subscription_ended_at, open_amount, oldest_due_date, days_overdue, last_paid_at, last_payment_method, last_payment_amount, last_visit_at, visit_count",
      )
      .order("name"),
    supabase
      .from("subscription_payments")
      .select(cyclePaymentColumns)
      .eq("status", "pendente")
      .order("due_date"),
    supabase
      .from("subscription_payments")
      .select(cyclePaymentColumns)
      .neq("status", "cancelado")
      .lte("period_start", today)
      .gte("period_end", today)
      .order("period_start"),
  ]);
  if (profiles.error) fail(profiles.error, "Não foi possível carregar os clientes.");
  if (open.error) fail(open.error, "Não foi possível carregar as mensalidades.");
  if (current.error) fail(current.error, "Não foi possível carregar as mensalidades.");

  const oldestByClient = new Map<string, CyclePayment>();
  for (const row of open.data as unknown as CyclePaymentRow[]) {
    const clientId = row.customer_subscriptions?.customer_id;
    if (clientId && !oldestByClient.has(clientId)) oldestByClient.set(clientId, toCyclePayment(row, clientId));
  }

  // Em ordem de início: se houver mais de um período hoje (troca de plano), fica o mais novo.
  const currentByClient = new Map<string, CyclePayment>();
  for (const row of current.data as unknown as CyclePaymentRow[]) {
    const clientId = row.customer_subscriptions?.customer_id;
    if (clientId) currentByClient.set(clientId, toCyclePayment(row, clientId));
  }

  return (profiles.data as ProfileRow[]).map((row) => {
    const next = oldestByClient.get(row.id) ?? null;
    return {
      id: row.id,
      name: row.name,
      phone: formatPhone(row.phone),
      whatsappOptIn: row.whatsapp_opt_in,
      membership: row.membership_status,
      planId: isPlanId(row.plan_slug) ? row.plan_slug : null,
      planName: row.plan_name,
      monthlyPrice: row.monthly_price === null ? null : Number(row.monthly_price),
      subscribedSince: row.subscribed_since,
      lastSubscriptionEndedAt: row.last_subscription_ended_at,
      openAmount: Number(row.open_amount),
      oldestDueDate: row.oldest_due_date,
      daysOverdue: row.days_overdue ?? 0,
      lastPaidAt: row.last_paid_at ? row.last_paid_at.slice(0, 10) : null,
      lastPaymentMethod: row.last_payment_method,
      lastPaymentAmount: row.last_payment_amount === null ? null : Number(row.last_payment_amount),
      // Data local do navegador, como o "hoje" do painel.
      lastVisitAt: row.last_visit_at ? getTodayIso(new Date(row.last_visit_at)) : null,
      visitCount: Number(row.visit_count ?? 0),
      nextToReceive: next,
      currentCycle: currentByClient.get(row.id) ?? null,
    };
  });
}

type MonthPaymentRow = {
  id: string;
  amount: number;
  status: MonthPayment["status"];
  customer_subscriptions: { subscription_plans: { slug: string } | null } | null;
};

/** Mensalidades com vencimento no mês (YYYY-MM). */
export async function fetchMonthPayments(month: string): Promise<MonthPayment[]> {
  const start = `${month}-01`;
  const [year, monthNumber] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);

  const { data, error } = await getSupabaseBrowserClient()
    .from("subscription_payments")
    .select("id, amount, status, customer_subscriptions!inner(subscription_plans(slug))")
    .gte("due_date", start)
    .lte("due_date", end);
  if (error) fail(error, "Não foi possível carregar as mensalidades do mês.");

  return (data as unknown as MonthPaymentRow[]).map((row) => {
    const slug = row.customer_subscriptions?.subscription_plans?.slug ?? null;
    return { id: row.id, amount: Number(row.amount), status: row.status, planId: isPlanId(slug) ? slug : null };
  });
}

/**
 * Registra o pagamento de uma mensalidade ou troca a forma de uma já paga (só admin).
 * Numa linha já paga, o banco mantém a data do pagamento e só troca a forma.
 */
export async function registerPayment(paymentId: string, method: PaymentMethod) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("subscription_payments")
    .update({ status: "pago", method })
    .eq("id", paymentId)
    .select("id");
  if (error) fail(error, "Não foi possível registrar o pagamento.");
  if (!data?.length) throw new PainelApiError("Só o administrador registra pagamentos.");
}
