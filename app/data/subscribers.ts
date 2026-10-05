import { addDays, getWeekday, type ServiceId } from "./booking";
import { getPlanBenefit, type PlanId } from "./plans";

// Regras e tipos dos assinantes. Puro (sem React e sem rede), usado pelo agendamento,
// pelo painel e pelo adaptador app/lib/subscribers-api.ts. Os formatos espelham o que
// as RPCs do Supabase devolvem (…121000_subscriber_accounts.sql).

/** Situação definida pela barbearia no painel. */
export type SubscriptionStatus = "ativo" | "congelado" | "inativo";

export const subscriptionStatuses: readonly SubscriptionStatus[] = ["ativo", "congelado", "inativo"];

export const subscriptionStatusLabels: Record<SubscriptionStatus, string> = {
  ativo: "Ativo",
  congelado: "Congelado",
  inativo: "Inativo",
};

/** Conta do assinante como o painel enxerga (view subscriber_accounts). A senha nunca vem junto. */
export type SubscriberAccount = {
  id: string;
  name: string;
  /** Formatado, ex.: (31) 99999-9999. É o login do cliente. */
  phone: string;
  planId: PlanId;
  status: SubscriptionStatus;
  /** Início da primeira assinatura (YYYY-MM-DD). */
  since: string;
};

/** Motivo de o plano não liberar benefícios. "pagamento_atrasado" vem da regra de mensalidades do banco. */
export type BlockedReason = "congelado" | "inativo" | "pagamento_atrasado";

/** Assinante logado no agendamento (RPC get_subscriber_session). */
export type SubscriberSession = {
  subscriberId: string;
  name: string;
  phone: string;
  planId: PlanId;
  status: SubscriptionStatus;
  blockedReason: BlockedReason | null;
};

export type CoverageReason = "incluido" | "fora_do_plano" | "limite_semanal" | BlockedReason;

/** O plano cobre o serviço na data? (RPC get_plan_coverage) */
export type PlanCoverage = {
  covered: boolean;
  reason: CoverageReason;
  planId: PlanId;
  /** Semana do benefício, de segunda a domingo. */
  weekStart: string;
  weekEnd: string;
};

export const blockedMessages: Record<BlockedReason, { title: string; description: string }> = {
  congelado: {
    title: "Assinatura congelada",
    description:
      "Os benefícios do seu plano estão pausados até a barbearia reativar a assinatura. Você ainda pode agendar pagando o valor avulso.",
  },
  inativo: {
    title: "Assinatura inativa",
    description:
      "Seu plano não está ativo no momento. Para voltar a usar os benefícios, fale com a barbearia. Você ainda pode agendar pagando o valor avulso.",
  },
  pagamento_atrasado: {
    title: "Mensalidade em atraso",
    description:
      "Os benefícios voltam assim que a mensalidade for regularizada na barbearia. Você ainda pode agendar pagando o valor avulso.",
  },
};

export function getBlockedReason(status: SubscriptionStatus): BlockedReason | null {
  return status === "ativo" ? null : status;
}

// --- Validação (mesmas regras de save_subscriber e do Supabase Auth) ---

export const passwordRules = { minLength: 6, maxLength: 72 };

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export type SubscriberField = "name" | "phone" | "password";
export type SubscriberErrors = Partial<Record<SubscriberField, string>>;

export function validateSubscriberName(name: string) {
  const length = name.trim().length;
  return length < 2 || length > 120 ? "Informe o nome do cliente." : undefined;
}

export function validateSubscriberPhone(phone: string) {
  return /^\d{10,11}$/.test(normalizePhone(phone)) ? undefined : "Informe um telefone com DDD.";
}

export function validateSubscriberPassword(password: string) {
  if (password.length < passwordRules.minLength) return `Use pelo menos ${passwordRules.minLength} caracteres.`;
  if (password.length > passwordRules.maxLength) return `Use até ${passwordRules.maxLength} caracteres.`;
  return undefined;
}

export function hasSubscriberErrors(errors: SubscriberErrors) {
  return Object.values(errors).some(Boolean);
}

// --- Benefícios por semana ---

/** Semana de segunda a domingo que contém a data, como getPeriodRange("semana") do painel. */
export function getWeekRange(isoDate: string) {
  const weekStart = addDays(isoDate, -((getWeekday(isoDate) + 6) % 7));
  return { weekStart, weekEnd: addDays(weekStart, 6) };
}

/**
 * Mesma regra de private.plan_coverage: o plano precisa estar liberado, incluir o
 * serviço e ainda ter uso disponível na semana da data.
 */
export function evaluateCoverage(
  session: Pick<SubscriberSession, "planId" | "blockedReason">,
  serviceId: ServiceId,
  date: string,
  usedThisWeek: number,
): PlanCoverage {
  const base = { planId: session.planId, ...getWeekRange(date) };
  const benefit = getPlanBenefit(session.planId, serviceId);

  if (session.blockedReason) return { ...base, covered: false, reason: session.blockedReason };
  if (!benefit) return { ...base, covered: false, reason: "fora_do_plano" };
  if (usedThisWeek >= benefit.perWeek) return { ...base, covered: false, reason: "limite_semanal" };
  return { ...base, covered: true, reason: "incluido" };
}
