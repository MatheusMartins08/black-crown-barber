import type { ServiceId } from "./booking";
import { services } from "./site";

// Catálogo dos planos de assinatura. É a única fonte para o site e para o painel, e
// espelha subscription_plans + plan_services (weekly_limit) no Supabase. Para mudar
// um benefício, altere `benefits`; para mudar o valor, `monthlyPrice`.

export type PlanBenefit = {
  serviceId: ServiceId;
  /** Quantas vezes o serviço está incluído por semana (segunda a domingo). */
  perWeek: number;
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  shortName: string;
  monthlyPrice: number;
  benefits: readonly PlanBenefit[];
};

export const subscriptionPlans = [
  {
    id: "bronze",
    name: "Plano Bronze",
    shortName: "Bronze",
    monthlyPrice: 99,
    benefits: [{ serviceId: "corte", perWeek: 1 }],
  },
  {
    id: "prata",
    name: "Plano Prata",
    shortName: "Prata",
    monthlyPrice: 129,
    benefits: [{ serviceId: "corte", perWeek: 1 }],
  },
  {
    id: "ouro",
    name: "Plano Ouro",
    shortName: "Ouro",
    monthlyPrice: 189,
    benefits: [
      { serviceId: "corte", perWeek: 1 },
      { serviceId: "barba", perWeek: 1 },
      { serviceId: "sobrancelha", perWeek: 1 },
    ],
  },
] as const satisfies readonly SubscriptionPlan[];

export type PlanId = (typeof subscriptionPlans)[number]["id"];

export function isPlanId(value: unknown): value is PlanId {
  return subscriptionPlans.some((plan) => plan.id === value);
}

export function getPlan(id: string | null): SubscriptionPlan | null {
  return subscriptionPlans.find((plan) => plan.id === id) ?? null;
}

export function getPlanBenefit(planId: string | null, serviceId: ServiceId | null): PlanBenefit | null {
  return getPlan(planId)?.benefits.find((benefit) => benefit.serviceId === serviceId) ?? null;
}

export function isServiceInPlan(planId: string | null, serviceId: ServiceId | null) {
  return getPlanBenefit(planId, serviceId) !== null;
}

export function formatPerWeek(perWeek: number) {
  return perWeek === 1 ? "1 por semana" : `${perWeek} por semana`;
}

function joinNames(names: string[]) {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names.at(-1)}` : (names[0] ?? "");
}

/** Ex.: "Corte masculino · 1 por semana" ou "Corte masculino, Barba e Sobrancelha · 1 por semana cada". */
export function describePlanBenefits(planId: string | null) {
  const plan = getPlan(planId);
  if (!plan) return "";
  const names = plan.benefits.map(
    (benefit) => services.find((service) => service.id === benefit.serviceId)?.name ?? benefit.serviceId,
  );
  const sameQuantity = plan.benefits.every((benefit) => benefit.perWeek === plan.benefits[0].perWeek);
  if (!sameQuantity) {
    return plan.benefits.map((benefit, index) => `${names[index]} · ${formatPerWeek(benefit.perWeek)}`).join(", ");
  }
  return `${joinNames(names)} · ${formatPerWeek(plan.benefits[0].perWeek)}${plan.benefits.length > 1 ? " cada" : ""}`;
}
