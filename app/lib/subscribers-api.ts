import { formatPhone, getTodayIso, type ServiceId } from "../data/booking";
import { clients, referenceDate, subscriptions } from "../data/customers";
import { isPlanId, type PlanId } from "../data/plans";
import {
  evaluateCoverage,
  getBlockedReason,
  getWeekRange,
  hasSubscriberErrors,
  normalizePhone,
  subscriptionStatuses,
  validateSubscriberName,
  validateSubscriberPassword,
  validateSubscriberPhone,
  type PlanCoverage,
  type SubscriberAccount,
  type SubscriberSession,
  type SubscriptionStatus,
} from "../data/subscribers";

// Adaptador dos assinantes, usado pelo agendamento e pelo painel. Assim como
// booking-api.ts, é o único ponto que muda ao conectar o Supabase. Cada função mantém
// a assinatura e passa a chamar:
//
//   signInSubscriber        supabase.auth.signInWithPassword (telefone + senha) e get_subscriber_session()
//   getSubscriberSession    get_subscriber_session() com a sessão salva pelo supabase-js
//   signOutSubscriber       supabase.auth.signOut()
//   fetchPlanCoverage       get_plan_coverage(p_service, p_date)
//   listSubscribers         select na view subscriber_accounts
//   createSubscriber        rotina de servidor: auth.admin.createUser (service role) + save_subscriber + set_subscription
//   updateSubscriber        rotina de servidor: auth.admin.updateUserById (se o telefone mudar) + save_subscriber
//   resetSubscriberPassword rotina de servidor: auth.admin.updateUserById({ password })
//   changeSubscriberPlan    set_subscription(p_customer_id, p_plan, p_status)
//   changeSubscriberStatus  set_subscription(p_customer_id, p_plan, p_status)
//
// Enquanto isso, os dados ficam no localStorage deste navegador (compartilhados entre
// /painel e /agendamento), semeados com os clientes ilustrativos do painel. A senha é
// guardada só como hash com sal e nunca sai daqui. O hash abaixo não é criptográfico:
// serve apenas para a simulação não guardar texto puro. No Supabase, a senha fica no
// Auth (bcrypt) e nunca passa pelas tabelas do projeto.

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

/** Senha das contas ilustrativas semeadas, válida apenas nesta simulação. */
const demoPassword = "crown123";

const storeKey = "black-crown:subscribers:v1";
const sessionKey = "black-crown:subscriber-auth:v1";
const simulatedLatency = 350;
const signInRules = { maxFailures: 5, lockMinutes: 5 };

type StoredAccount = {
  id: string;
  name: string;
  /** Só dígitos, com DDD. */
  phone: string;
  planId: PlanId;
  status: SubscriptionStatus;
  since: string;
  credential: { salt: string; hash: string };
};

/** Usos de benefício registrados nos agendamentos feitos como assinante. */
type StoredUsage = { subscriberId: string; serviceId: ServiceId; date: string; code: string };

type Store = {
  version: 1;
  accounts: StoredAccount[];
  usage: StoredUsage[];
  attempts: Record<string, { failures: number; lockedUntil: number | null }>;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// cyrb53, repetido com sal. Suficiente para a simulação; não use fora dela.
function hashText(value: string, seed: number) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function hashPassword(password: string, salt: string) {
  let digest = `${salt}:${password}`;
  for (let round = 0; round < 256; round++) digest = hashText(`${digest}${salt}`, round);
  return digest;
}

function createSalt() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createCredential(password: string, salt = createSalt()) {
  return { salt, hash: hashPassword(password, salt) };
}

/** Contas iniciais: os clientes do painel que já assinaram, na situação de 03/10/2026. */
function createSeedStore(): Store {
  const accounts = clients.flatMap((client): StoredAccount[] => {
    const periods = subscriptions
      .filter((subscription) => subscription.clientId === client.id)
      .sort((first, second) => first.startedAt.localeCompare(second.startedAt));
    if (!periods.length) return [];

    const current = periods.find(
      (period) =>
        period.status !== "cancelada" &&
        period.startedAt <= referenceDate &&
        (period.endedAt === null || period.endedAt >= referenceDate),
    );
    const id = `sub-${client.id}`;

    return [
      {
        id,
        name: client.name,
        phone: normalizePhone(client.phone),
        planId: (current ?? periods.at(-1)!).planId,
        status: current ? (current.status === "suspensa" ? "congelado" : "ativo") : "inativo",
        since: periods[0].startedAt,
        credential: createCredential(demoPassword, id),
      },
    ];
  });

  return { version: 1, accounts, usage: [], attempts: {} };
}

// Sem localStorage (aba privada, bloqueio), a simulação segue apenas em memória.
let memoryStore: Store | null = null;

function isStore(value: unknown): value is Store {
  const candidate = value as Store | null;
  return candidate?.version === 1 && Array.isArray(candidate.accounts) && Array.isArray(candidate.usage);
}

function readStore(): Store {
  try {
    const stored = localStorage.getItem(storeKey);
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    if (isStore(parsed)) return { ...parsed, attempts: parsed.attempts ?? {} };
  } catch {
    if (memoryStore) return memoryStore;
  }
  const seeded = memoryStore ?? createSeedStore();
  writeStore(seeded);
  return seeded;
}

function writeStore(store: Store) {
  memoryStore = store;
  try {
    localStorage.setItem(storeKey, JSON.stringify(store));
  } catch {
    // Mantém só em memória.
  }
}

function readSessionId() {
  try {
    const stored = sessionStorage.getItem(sessionKey);
    const parsed = stored ? (JSON.parse(stored) as { subscriberId?: unknown }) : null;
    return typeof parsed?.subscriberId === "string" ? parsed.subscriberId : null;
  } catch {
    return null;
  }
}

function writeSessionId(subscriberId: string | null) {
  try {
    if (subscriberId) sessionStorage.setItem(sessionKey, JSON.stringify({ subscriberId, signedInAt: Date.now() }));
    else sessionStorage.removeItem(sessionKey);
  } catch {
    // Sem armazenamento, a sessão vale só enquanto a página estiver aberta.
  }
}

function toAccount(stored: StoredAccount): SubscriberAccount {
  return {
    id: stored.id,
    name: stored.name,
    phone: formatPhone(stored.phone),
    planId: stored.planId,
    status: stored.status,
    since: stored.since,
  };
}

function toSession(stored: StoredAccount): SubscriberSession {
  return {
    subscriberId: stored.id,
    name: stored.name,
    phone: formatPhone(stored.phone),
    planId: stored.planId,
    status: stored.status,
    blockedReason: getBlockedReason(stored.status),
  };
}

function findAccount(store: Store, id: string) {
  const account = store.accounts.find((item) => item.id === id);
  if (!account) throw new SubscriberApiError("Assinante não encontrado.", "not_found");
  return account;
}

function assertPhoneAvailable(store: Store, phone: string, exceptId?: string) {
  if (store.accounts.some((account) => account.phone === phone && account.id !== exceptId)) {
    throw new SubscriberApiError("Já existe um assinante com este telefone.", "phone_in_use");
  }
}

function invalid(message: string): never {
  throw new SubscriberApiError(message, "invalid_request");
}

function updateAccount(id: string, change: (account: StoredAccount, store: Store) => StoredAccount) {
  const store = readStore();
  const updated = change(findAccount(store, id), store);
  writeStore({ ...store, accounts: store.accounts.map((account) => (account.id === id ? updated : account)) });
  return toAccount(updated);
}

function countWeekUsage(store: Store, subscriberId: string, serviceId: ServiceId, date: string) {
  const { weekStart, weekEnd } = getWeekRange(date);
  return store.usage.filter(
    (item) =>
      item.subscriberId === subscriberId &&
      item.serviceId === serviceId &&
      item.date >= weekStart &&
      item.date <= weekEnd,
  ).length;
}

// --- Assinante no agendamento ---

/** Entra com o telefone cadastrado pela barbearia e a senha. */
export async function signInSubscriber(credentials: { phone: string; password: string }): Promise<SubscriberSession> {
  await wait(simulatedLatency * 2);

  const phone = normalizePhone(credentials.phone);
  const store = readStore();
  const attempt = store.attempts[phone];

  if (attempt?.lockedUntil && attempt.lockedUntil > Date.now()) {
    throw new SubscriberApiError(
      "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.",
      "too_many_attempts",
    );
  }

  const account = store.accounts.find((item) => item.phone === phone);
  const matches = account && hashPassword(credentials.password, account.credential.salt) === account.credential.hash;

  if (!account || !matches) {
    const failures = (attempt?.lockedUntil ? 0 : attempt?.failures ?? 0) + 1;
    const locked = failures >= signInRules.maxFailures;
    writeStore({
      ...store,
      attempts: {
        ...store.attempts,
        [phone]: { failures, lockedUntil: locked ? Date.now() + signInRules.lockMinutes * 60_000 : null },
      },
    });
    throw locked
      ? new SubscriberApiError("Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.", "too_many_attempts")
      : new SubscriberApiError("Telefone ou senha incorretos.", "invalid_credentials");
  }

  const attempts = { ...store.attempts };
  delete attempts[phone];
  writeStore({ ...store, attempts });
  writeSessionId(account.id);
  return toSession(account);
}

/** Assinante da sessão atual, com plano e situação atualizados. `null` sem login. */
export async function getSubscriberSession(): Promise<SubscriberSession | null> {
  const subscriberId = readSessionId();
  if (!subscriberId) return null;

  await wait(simulatedLatency);
  const account = readStore().accounts.find((item) => item.id === subscriberId);
  if (!account) {
    writeSessionId(null);
    return null;
  }
  return toSession(account);
}

export async function signOutSubscriber() {
  writeSessionId(null);
}

/** O plano do assinante logado cobre o serviço nesta data? `null` sem login. */
export async function fetchPlanCoverage(query: { serviceId: ServiceId; date: string }): Promise<PlanCoverage | null> {
  const subscriberId = readSessionId();
  if (!subscriberId) return null;

  await wait(simulatedLatency);
  const store = readStore();
  const account = store.accounts.find((item) => item.id === subscriberId);
  if (!account) return null;
  return evaluateCoverage(
    toSession(account),
    query.serviceId,
    query.date,
    countWeekUsage(store, account.id, query.serviceId, query.date),
  );
}

/**
 * Só da simulação: decide a cobertura no momento da confirmação e registra o uso do
 * benefício. No Supabase, isso acontece dentro de create_subscriber_reservation.
 */
export function claimPlanCoverage(query: { serviceId: ServiceId; date: string; code: string }) {
  const subscriberId = readSessionId();
  const store = readStore();
  const account = subscriberId ? store.accounts.find((item) => item.id === subscriberId) : null;
  if (!account) {
    throw new SubscriberApiError("Sua sessão expirou. Entre novamente para agendar como assinante.", "not_found");
  }

  const session = toSession(account);
  const coverage = evaluateCoverage(
    session,
    query.serviceId,
    query.date,
    countWeekUsage(store, account.id, query.serviceId, query.date),
  );

  if (coverage.covered) {
    writeStore({
      ...store,
      usage: [...store.usage, { subscriberId: account.id, serviceId: query.serviceId, date: query.date, code: query.code }],
    });
  }

  return { session, coverage };
}

// --- Painel ---

export async function listSubscribers(): Promise<SubscriberAccount[]> {
  await wait(simulatedLatency);
  return readStore()
    .accounts.map(toAccount)
    .sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
}

export type NewSubscriber = {
  name: string;
  phone: string;
  password: string;
  planId: PlanId;
  status: SubscriptionStatus;
};

export async function createSubscriber(input: NewSubscriber): Promise<SubscriberAccount> {
  await wait(simulatedLatency * 2);

  const errors = {
    name: validateSubscriberName(input.name),
    phone: validateSubscriberPhone(input.phone),
    password: validateSubscriberPassword(input.password),
  };
  if (hasSubscriberErrors(errors) || !isPlanId(input.planId) || !subscriptionStatuses.includes(input.status)) {
    invalid("Revise os dados do assinante.");
  }

  const store = readStore();
  const phone = normalizePhone(input.phone);
  assertPhoneAvailable(store, phone);

  const id = `sub-${Date.now().toString(36)}${createSalt().slice(0, 4)}`;
  const account: StoredAccount = {
    id,
    name: input.name.trim(),
    phone,
    planId: input.planId,
    status: input.status,
    since: getTodayIso(),
    credential: createCredential(input.password),
  };

  writeStore({ ...store, accounts: [...store.accounts, account] });
  return toAccount(account);
}

export async function updateSubscriber(id: string, changes: { name: string; phone: string }): Promise<SubscriberAccount> {
  await wait(simulatedLatency);
  if (validateSubscriberName(changes.name) || validateSubscriberPhone(changes.phone)) {
    invalid("Revise os dados do assinante.");
  }

  return updateAccount(id, (account, store) => {
    const phone = normalizePhone(changes.phone);
    assertPhoneAvailable(store, phone, id);
    return { ...account, name: changes.name.trim(), phone };
  });
}

export async function changeSubscriberPlan(id: string, planId: PlanId): Promise<SubscriberAccount> {
  await wait(simulatedLatency);
  if (!isPlanId(planId)) invalid("Plano inválido.");

  return updateAccount(id, (account) => {
    if (account.status === "inativo") invalid("Reative a assinatura para trocar o plano.");
    return { ...account, planId };
  });
}

export async function changeSubscriberStatus(id: string, status: SubscriptionStatus): Promise<SubscriberAccount> {
  await wait(simulatedLatency);
  if (!subscriptionStatuses.includes(status)) invalid("Situação inválida.");

  return updateAccount(id, (account) => ({ ...account, status }));
}

export async function resetSubscriberPassword(id: string, password: string): Promise<void> {
  await wait(simulatedLatency);
  if (validateSubscriberPassword(password)) invalid("Revise a nova senha.");

  updateAccount(id, (account) => ({ ...account, credential: createCredential(password) }));

  const store = readStore();
  const phone = findAccount(store, id).phone;
  const attempts = { ...store.attempts };
  delete attempts[phone];
  writeStore({ ...store, attempts });
}
