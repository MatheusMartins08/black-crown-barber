import { formatPhone, type ServiceId } from "../data/booking";
import { isPlanId, type PlanId } from "../data/plans";
import {
  getSubscriberLoginEmail,
  type BlockedReason,
  type CoverageReason,
  type PlanCoverage,
  type SubscriberAccount,
  type SubscriberSession,
  type SubscriptionStatus,
} from "../data/subscribers";
import {
  createSubscriberAction,
  resetSubscriberPasswordAction,
  updateSubscriberAction,
  type SubscriberActionResult,
} from "../painel/actions";
import { getSupabaseBrowserClient } from "./supabase/client";
import { getRpcMessage, type RpcError } from "./supabase/errors";

// Adaptador dos assinantes, usado pelo agendamento e pelo painel. Fala com o Supabase:
//
//   signInSubscriber        auth.signInWithPassword (e-mail interno do telefone) + get_subscriber_session()
//   getSubscriberSession    get_subscriber_session()
//   signOutSubscriber       auth.signOut()
//   fetchPlanCoverage       get_plan_coverage(p_service, p_date)
//   listSubscribers         view subscriber_accounts
//   changeSubscriberPlan    set_subscription(p_customer_id, p_plan, p_status)
//   changeSubscriberStatus  set_subscription(p_customer_id, p_plan, p_status)
//   createSubscriber        Server Action (auth.admin.createUser + save_subscriber + set_subscription)
//   updateSubscriber        Server Action (auth.admin.updateUserById se o telefone mudar + save_subscriber)
//   resetSubscriberPassword Server Action (auth.admin.updateUserById)
//
// A senha fica só no Supabase Auth. O limite de tentativas de login também é do Auth.

export type SubscriberApiErrorReason =
  | "invalid_credentials"
  | "too_many_attempts"
  | "phone_in_use"
  | "not_found"
  | "invalid_request";

export class SubscriberApiError extends Error {
  constructor(
    message: string,
    readonly reason: SubscriberApiErrorReason,
  ) {
    super(message);
    this.name = "SubscriberApiError";
  }
}

function fromRpc(error: RpcError, fallback: string): never {
  if (error.code === "42501") throw new SubscriberApiError("Só o administrador gerencia assinantes.", "invalid_request");
  if (error.message === "subscriber_not_found") throw new SubscriberApiError(getRpcMessage(error, fallback), "not_found");
  throw new SubscriberApiError(getRpcMessage(error, fallback), "invalid_request");
}

function fromAction(result: SubscriberActionResult) {
  if (result.ok) return result.id;
  const reason: SubscriberApiErrorReason =
    result.reason === "phone_in_use" || result.reason === "not_found" ? result.reason : "invalid_request";
  throw new SubscriberApiError(result.message, reason);
}

// --- Assinante no agendamento ---

type SessionPayload = {
  subscriberId: string;
  name: string;
  phone: string;
  planId: string;
  status: SubscriptionStatus;
  blockedReason: BlockedReason | null;
};

function toSession(payload: SessionPayload | null): SubscriberSession | null {
  if (!payload || !isPlanId(payload.planId)) return null;
  return { ...payload, planId: payload.planId, blockedReason: payload.blockedReason ?? null };
}

async function readSession() {
  const { data, error } = await getSupabaseBrowserClient().rpc("get_subscriber_session");
  if (error) return null;
  return toSession(data as SessionPayload | null);
}

/** Entra com o telefone cadastrado pela barbearia e a senha. */
export async function signInSubscriber(credentials: { phone: string; password: string }): Promise<SubscriberSession> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: getSubscriberLoginEmail(credentials.phone),
    password: credentials.password,
  });

  if (error) {
    throw error.status === 429
      ? new SubscriberApiError("Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.", "too_many_attempts")
      : new SubscriberApiError("Telefone ou senha incorretos.", "invalid_credentials");
  }

  const session = await readSession();
  if (!session) {
    // O login existe, mas não está ligado a um assinante (por exemplo, conta da equipe).
    await supabase.auth.signOut();
    throw new SubscriberApiError("Telefone ou senha incorretos.", "invalid_credentials");
  }
  return session;
}

/** Assinante da sessão atual, com plano e situação atualizados. `null` sem login de assinante. */
export async function getSubscriberSession(): Promise<SubscriberSession | null> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  if (!data.session) return null;
  return readSession();
}

export async function signOutSubscriber() {
  await getSupabaseBrowserClient().auth.signOut();
}

type CoveragePayload = {
  covered: boolean;
  reason: CoverageReason;
  planId: string | null;
  weekStart: string;
  weekEnd: string;
};

/** O plano do assinante logado cobre o serviço nesta data? `null` sem login. */
export async function fetchPlanCoverage(query: { serviceId: ServiceId; date: string }): Promise<PlanCoverage | null> {
  const supabase = getSupabaseBrowserClient();
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) return null;

  const { data, error } = await supabase.rpc("get_plan_coverage", {
    p_service: query.serviceId,
    p_date: query.date,
  });
  if (error) fromRpc(error, "Não foi possível conferir o plano.");

  const payload = data as CoveragePayload | null;
  if (!payload || !isPlanId(payload.planId)) return null;
  return { ...payload, planId: payload.planId };
}

// --- Painel ---

type AccountRow = {
  id: string;
  name: string;
  phone: string;
  plan_slug: string;
  status: SubscriptionStatus;
  subscribed_since: string;
};

function toAccount(row: AccountRow): SubscriberAccount {
  return {
    id: row.id,
    name: row.name,
    phone: formatPhone(row.phone),
    planId: isPlanId(row.plan_slug) ? row.plan_slug : "bronze",
    status: row.status,
    since: row.subscribed_since,
  };
}

const accountColumns = "id, name, phone, plan_slug, status, subscribed_since";

export async function listSubscribers(): Promise<SubscriberAccount[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("subscriber_accounts")
    .select(accountColumns)
    .order("name");
  if (error) fromRpc(error, "Não foi possível carregar os assinantes.");
  return (data as AccountRow[]).map(toAccount);
}

async function getAccount(id: string) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("subscriber_accounts")
    .select(accountColumns)
    .eq("id", id)
    .maybeSingle();
  if (error) fromRpc(error, "Não foi possível carregar o assinante.");
  if (!data) throw new SubscriberApiError("Assinante não encontrado.", "not_found");
  return toAccount(data as AccountRow);
}

async function setSubscription(id: string, planId: PlanId, status: SubscriptionStatus) {
  const { error } = await getSupabaseBrowserClient().rpc("set_subscription", {
    p_customer_id: id,
    p_plan: planId,
    p_status: status,
  });
  if (error) fromRpc(error, "Não foi possível salvar.");
  return getAccount(id);
}

export type NewSubscriber = {
  name: string;
  phone: string;
  password: string;
  planId: PlanId;
  status: SubscriptionStatus;
};

export async function createSubscriber(input: NewSubscriber): Promise<SubscriberAccount> {
  return getAccount(fromAction(await createSubscriberAction(input)));
}

export async function updateSubscriber(id: string, changes: { name: string; phone: string }): Promise<SubscriberAccount> {
  return getAccount(fromAction(await updateSubscriberAction(id, changes)));
}

export async function changeSubscriberPlan(id: string, planId: PlanId): Promise<SubscriberAccount> {
  if (!isPlanId(planId)) throw new SubscriberApiError("Plano inválido.", "invalid_request");
  const account = await getAccount(id);
  if (account.status === "inativo") {
    throw new SubscriberApiError("Reative a assinatura para trocar o plano.", "invalid_request");
  }
  return setSubscription(id, planId, account.status);
}

export async function changeSubscriberStatus(id: string, status: SubscriptionStatus): Promise<SubscriberAccount> {
  const account = await getAccount(id);
  return setSubscription(id, account.planId, status);
}

export async function resetSubscriberPassword(id: string, password: string): Promise<void> {
  fromAction(await resetSubscriberPasswordAction(id, password));
}
