import { formatCurrency, formatShortDate, sumServices, type ServiceId } from "../../data/booking";
import { getPlan, type SubscriptionPlan } from "../../data/plans";
import type { Service } from "../../data/services";
import { blockedMessages, type PlanCoverage } from "../../data/subscribers";

// Como o valor aparece no resumo, na revisão e na confirmação quando o cliente é assinante.

/** "Incluído" quando o plano cobre; senão o preço avulso. */
export function getPriceLabel(price: number, coverage: PlanCoverage | null) {
  return coverage?.covered ? "Incluído" : formatCurrency(price);
}

/** Cobertura do plano de cada serviço escolhido (slug → cobertura). Vazio para avulso. */
export type CoverageMap = Partial<Record<ServiceId, PlanCoverage | null>>;

/** Quanto o cliente paga: soma dos serviços que o plano não cobre. */
export function getChargedTotal(items: readonly Pick<Service, "slug" | "price">[], coverage: CoverageMap) {
  return sumServices(
    items.filter((item) => !coverage[item.slug]?.covered).map((item) => ({ price: item.price, durationMinutes: 0 })),
  ).price;
}

/**
 * Total do atendimento: "Incluído" quando o plano cobre tudo; senão o valor a pagar
 * (só os serviços fora do plano, para o assinante).
 */
export function getTotalLabel(
  items: readonly Pick<Service, "slug" | "price">[],
  coverage: CoverageMap | null,
): string | null {
  if (!items.length) return null;
  if (!coverage) return formatCurrency(sumServices(items.map((item) => ({ ...item, durationMinutes: 0 }))).price);
  if (items.every((item) => coverage[item.slug]?.covered)) return "Incluído";
  return formatCurrency(getChargedTotal(items, coverage));
}

/** Linha curta sobre o plano, ex.: "Incluído no Plano Bronze" ou "Fora do Plano Bronze". */
export function getCoverageNote(coverage: PlanCoverage | null, plans: readonly SubscriptionPlan[]) {
  if (!coverage) return null;
  const planName = getPlan(plans, coverage.planId)?.name ?? "plano";

  switch (coverage.reason) {
    case "incluido":
      return `Incluído no ${planName}`;
    case "fora_do_plano":
      return `Fora do ${planName} · valor avulso`;
    case "limite_semanal":
      return `Benefício da semana já usado · valor avulso`;
    case "limite_mensal":
      return `Benefício do mês já usado · valor avulso`;
    default:
      return `${blockedMessages[coverage.reason].title} · valor avulso`;
  }
}

/** Janela do benefício (semana ou ciclo mensal), ex.: "05/10 a 11/10". */
export function formatWeek(coverage: PlanCoverage) {
  return `${formatShortDate(coverage.weekStart)} a ${formatShortDate(coverage.weekEnd)}`;
}
