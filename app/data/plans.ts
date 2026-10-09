import type { ServiceId } from "./booking";
import { createServiceSlug } from "./services";

// Planos de assinatura (subscription_plans + plan_services). Única fonte para o agendamento
// e o painel: os dados chegam do Supabase por app/lib/catalog.ts (site) e pelo layout do
// painel. Cada mensalidade guarda o valor do ciclo em que foi gerada, então mudar o preço
// vale só para os próximos ciclos. Puro (sem React e sem rede).

/** semana: segunda a domingo. mes: ciclo da mensalidade (dia de início da assinatura + k meses). */
export type PlanPeriod = "semana" | "mes";

export type PlanBenefit = {
  /** Slug do serviço incluído. */
  serviceId: ServiceId;
  /** Quantas vezes o serviço está incluído no período. */
  quantity: number;
  period: PlanPeriod;
};

export type SubscriptionPlan = {
  /** uuid estável: assinaturas e mensalidades referenciam o plano por ele. */
  id: string;
  /** Identificador usado pelas RPCs (set_subscription, sessão do assinante). Fixo depois de criado. */
  slug: string;
  name: string;
  /** Nome curto para seletores e resumos: "Plano Ouro" → "Ouro". */
  shortName: string;
  description: string;
  monthlyPrice: number;
  isActive: boolean;
  /** Excluído pelo painel com histórico: fica só para assinaturas e mensalidades antigas. */
  deletedAt: string | null;
  sortOrder: number;
  benefits: PlanBenefit[];
};

/** Slug do plano (subscription_plans.slug). */
export type PlanId = string;

export type PlanRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  monthly_price: number | string;
  is_active: boolean;
  deleted_at: string | null;
  sort_order: number;
  plan_services?: { weekly_limit: number; period: PlanPeriod; services: { slug: string } | null }[];
};

export const planColumns =
  "id, slug, name, description, monthly_price, is_active, deleted_at, sort_order, plan_services(weekly_limit, period, services(slug))";

export function getShortName(name: string) {
  return name.replace(/^plano\s+/i, "").trim() || name;
}

export function toPlan(row: PlanRow): SubscriptionPlan {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortName: getShortName(row.name),
    description: row.description ?? "",
    monthlyPrice: Number(row.monthly_price),
    isActive: row.is_active,
    deletedAt: row.deleted_at,
    sortOrder: row.sort_order,
    benefits: (row.plan_services ?? []).flatMap((item) =>
      item.services ? [{ serviceId: item.services.slug, quantity: item.weekly_limit, period: item.period }] : [],
    ),
  };
}

export function sortPlans(list: SubscriptionPlan[]) {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR"));
}

/**
 * Algum plano aceita novos assinantes? Sem nenhum, o agendamento não pergunta se o cliente é
 * assinante e a Visão geral do painel esconde os indicadores de planos. A edição dos planos
 * continua disponível; reativar um plano traz tudo de volta.
 */
export function hasActivePlans(plans: readonly SubscriptionPlan[]) {
  return plans.some((plan) => plan.isActive && !plan.deletedAt);
}

export function getPlan(plans: readonly SubscriptionPlan[], slug: string | null): SubscriptionPlan | null {
  return plans.find((plan) => plan.slug === slug) ?? null;
}

export function getPlanBenefit(
  plans: readonly SubscriptionPlan[],
  planSlug: string | null,
  serviceId: ServiceId | null,
): PlanBenefit | null {
  return getPlan(plans, planSlug)?.benefits.find((benefit) => benefit.serviceId === serviceId) ?? null;
}

/** "1 por semana", "2 por semana", "4 por mês". */
export function formatFrequency(benefit: Pick<PlanBenefit, "quantity" | "period">) {
  return `${benefit.quantity} por ${benefit.period === "mes" ? "mês" : "semana"}`;
}

function joinNames(names: string[]) {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names.at(-1)}` : (names[0] ?? "");
}

/**
 * Ex.: "Corte masculino · 1 por semana" ou "Corte masculino, Barba e Sobrancelha · 1 por semana cada".
 * `services` é o catálogo atual (Supabase): o nome de cada benefício acompanha o serviço, e
 * benefícios de serviços fora da lista recebida (ex.: inativados) não são listados.
 */
export function describePlanBenefits(
  plan: SubscriptionPlan | null,
  services: readonly { slug: string; name: string }[],
) {
  if (!plan) return "";
  const benefits = plan.benefits.flatMap((benefit) => {
    const service = services.find((item) => item.slug === benefit.serviceId);
    return service ? [{ ...benefit, name: service.name }] : [];
  });
  if (!benefits.length) return "";
  const sameFrequency = benefits.every(
    (benefit) => benefit.quantity === benefits[0].quantity && benefit.period === benefits[0].period,
  );
  if (!sameFrequency) return benefits.map((benefit) => `${benefit.name} · ${formatFrequency(benefit)}`).join(", ");
  const names = benefits.map((benefit) => benefit.name);
  return `${joinNames(names)} · ${formatFrequency(benefits[0])}${benefits.length > 1 ? " cada" : ""}`;
}

// --- Cadastro no painel ---

export const planLimits = { name: 50, description: 240, maxPrice: 9999, maxWeekly: 7, maxMonthly: 31 };

export type PlanBenefitInput = { serviceId: string; quantity: number; period: PlanPeriod };

export type PlanInput = {
  name: string;
  description: string;
  monthlyPrice: number;
  /** serviceId aqui é o uuid do serviço. */
  benefits: PlanBenefitInput[];
};

export type PlanErrors = Partial<Record<"name" | "description" | "monthlyPrice" | "benefits", string>>;

/** Até 2 casas decimais (com tolerância de ponto flutuante). */
const isMoney = (value: number) => Number.isFinite(value) && Math.abs(Math.round(value * 100) - value * 100) < 1e-6;

export function validatePlan(input: PlanInput): PlanErrors {
  const errors: PlanErrors = {};
  const name = input.name.trim();
  if (name.length < 2) errors.name = "Informe o nome do plano.";
  else if (name.length > planLimits.name) errors.name = `Use até ${planLimits.name} caracteres.`;
  if (input.description.trim().length > planLimits.description) {
    errors.description = `Use até ${planLimits.description} caracteres.`;
  }
  if (!isMoney(input.monthlyPrice) || input.monthlyPrice <= 0 || input.monthlyPrice > planLimits.maxPrice) {
    errors.monthlyPrice = "Informe a mensalidade, ex.: 99 ou 129,90.";
  }
  const ids = input.benefits.map((benefit) => benefit.serviceId);
  if (!input.benefits.length) errors.benefits = "Inclua pelo menos um serviço no plano.";
  else if (new Set(ids).size !== ids.length) errors.benefits = "Cada serviço pode aparecer uma vez só.";
  else if (
    input.benefits.some(
      (benefit) =>
        !benefit.serviceId ||
        (benefit.period !== "semana" && benefit.period !== "mes") ||
        !Number.isInteger(benefit.quantity) ||
        benefit.quantity < 1 ||
        benefit.quantity > (benefit.period === "mes" ? planLimits.maxMonthly : planLimits.maxWeekly),
    )
  ) {
    errors.benefits = `Use de 1 a ${planLimits.maxWeekly} vezes por semana ou de 1 a ${planLimits.maxMonthly} por mês.`;
  }
  return errors;
}

/** "Plano Diamante" -> "diamante"; se já existir, recebe sufixo numérico. */
export function createPlanSlug(name: string, taken: readonly string[]) {
  return createServiceSlug(getShortName(name), taken);
}
