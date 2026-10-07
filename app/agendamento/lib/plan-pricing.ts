import { formatCurrency, formatShortDate } from "../../data/booking";
import { getPlan, type SubscriptionPlan } from "../../data/plans";
import { blockedMessages, type PlanCoverage } from "../../data/subscribers";

// Como o valor aparece no resumo, na revisão e na confirmação quando o cliente é assinante.

/** "Incluído" quando o plano cobre; senão o preço avulso. */
export function getPriceLabel(price: number, coverage: PlanCoverage | null) {
  return coverage?.covered ? "Incluído" : formatCurrency(price);
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
