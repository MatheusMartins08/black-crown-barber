// Serviços da barbearia (tabela services). Única fonte para a landing, o agendamento,
// os planos e o painel: os dados chegam do Supabase por app/lib/catalog.ts (site) e pelo
// layout do painel. Preço e duração de cada atendimento são copiados na reserva, então
// mudar o catálogo nunca altera o histórico. Puro (sem React e sem rede).

export type Service = {
  /** uuid estável: é o que atendimentos, planos e repasses referenciam. */
  id: string;
  /** Identificador público (links "?servico=", RPCs do agendamento, planos). Fixo depois de criado. */
  slug: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  /** Chave do ícone (app/components/service-icons.ts). */
  icon: string;
  /** Selo "Mais pedido" na landing e no agendamento. */
  isPopular: boolean;
  isActive: boolean;
  /** Excluído pelo painel com histórico (ISO): some de tudo, menos de atendimentos e fechamentos. */
  deletedAt: string | null;
  sortOrder: number;
  /** Repasse fixo ao profissional quando o plano cobre (service_payouts). Só a equipe lê; null no site. */
  planPayout: number | null;
  /**
   * Combo: ids dos serviços simples que ele já inclui (service_components). Vazio num serviço
   * simples. Dois serviços que cobrem o mesmo serviço simples não entram no mesmo agendamento.
   */
  components: string[];
};

export type ServiceRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number | string;
  icon: string | null;
  is_popular: boolean;
  is_active: boolean;
  deleted_at: string | null;
  sort_order: number;
  /** 1-para-1 com services; o PostgREST pode devolver objeto ou lista. */
  service_payouts?: { plan_payout_amount: number | string } | { plan_payout_amount: number | string }[] | null;
  service_components?: { component_id: string }[];
};

export const serviceColumns =
  "id, slug, name, description, duration_minutes, price, icon, is_popular, is_active, deleted_at, sort_order, service_components!service_components_service_id_fkey(component_id)";

/** Com o repasse do plano (só a equipe pode ler service_payouts). */
export const staffServiceColumns = `${serviceColumns}, service_payouts(plan_payout_amount)`;

export function toService(row: ServiceRow): Service {
  const payout = Array.isArray(row.service_payouts) ? row.service_payouts[0] : row.service_payouts;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    durationMinutes: row.duration_minutes,
    price: Number(row.price),
    icon: row.icon ?? "scissors",
    isPopular: row.is_popular,
    isActive: row.is_active,
    deletedAt: row.deleted_at,
    sortOrder: row.sort_order,
    planPayout: payout ? Number(payout.plan_payout_amount) : null,
    components: (row.service_components ?? []).map((item) => item.component_id),
  };
}

export function sortServices(list: Service[]) {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR"));
}

/** 30 → "30 min"; 90 → "1 h 30 min"; 60 → "1 h". */
export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/**
 * Resposta do FAQ sobre duração, com o catálogo atual:
 * "Corte masculino: cerca de 30 min. Barba: cerca de 30 min. … O tempo pode variar conforme o estilo escolhido."
 */
export function describeServiceDurations(services: readonly Pick<Service, "name" | "durationMinutes">[]) {
  if (!services.length) return null;
  const lines = services.map((service) => `${service.name}: cerca de ${formatDuration(service.durationMinutes)}.`);
  return `${lines.join(" ")} O tempo pode variar conforme o estilo escolhido.`;
}

// --- Cadastro no painel ---

export const serviceLimits = {
  name: 50,
  description: 160,
  minDuration: 5,
  maxDuration: 480,
  maxPrice: 9999,
};

export type ServiceInput = {
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  planPayout: number;
  icon: string;
  isPopular: boolean;
};

export type ServiceErrors = Partial<Record<"name" | "description" | "durationMinutes" | "price" | "planPayout" | "icon", string>>;

/** Até 2 casas decimais (com tolerância de ponto flutuante: 0,1 × 100 ≠ 10 exato). */
const isMoney = (value: number) => Number.isFinite(value) && Math.abs(Math.round(value * 100) - value * 100) < 1e-6;

export function validateService(input: ServiceInput, iconKeys: readonly string[]): ServiceErrors {
  const errors: ServiceErrors = {};
  const name = input.name.trim();
  if (name.length < 2) errors.name = "Informe o nome do serviço.";
  else if (name.length > serviceLimits.name) errors.name = `Use até ${serviceLimits.name} caracteres.`;
  if (input.description.trim().length > serviceLimits.description) {
    errors.description = `Use até ${serviceLimits.description} caracteres.`;
  }
  if (
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < serviceLimits.minDuration ||
    input.durationMinutes > serviceLimits.maxDuration
  ) {
    errors.durationMinutes = `Informe de ${serviceLimits.minDuration} a ${serviceLimits.maxDuration} minutos.`;
  }
  if (!isMoney(input.price) || input.price < 0 || input.price > serviceLimits.maxPrice) {
    errors.price = "Informe um valor válido, ex.: 55 ou 52,50.";
  }
  if (!isMoney(input.planPayout) || input.planPayout < 0 || input.planPayout > serviceLimits.maxPrice) {
    errors.planPayout = "Informe um valor válido (0 se não houver repasse).";
  }
  if (!iconKeys.includes(input.icon)) errors.icon = "Escolha um ícone.";
  return errors;
}

/** "Corte + barba" -> "corte-barba"; se já existir, recebe sufixo numérico. */
export function createServiceSlug(name: string, taken: readonly string[]) {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "servico";
  const reserved = new Set(taken);
  if (!reserved.has(base)) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base}-${index}`;
    if (!reserved.has(candidate)) return candidate;
  }
}

/** "52,50" ou "52.50" -> 52.5; vazio ou inválido -> NaN. */
export function parseMoney(value: string) {
  const normalized = value.trim().replace(/\s|R\$/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  return normalized ? Number(normalized) : Number.NaN;
}

/** 52.5 -> "52,50"; 55 -> "55". */
export function formatMoneyInput(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",");
}
