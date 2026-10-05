import type { PlanId } from "./plans";

// Clientes e períodos de assinatura ilustrativos. Alimentam o painel (painel.ts) e a
// base inicial de assinantes da simulação (app/lib/subscribers-api.ts), para que os
// dois comecem iguais. Somem quando o painel ler o Supabase.

/** "Hoje" dos dados ilustrativos do painel. */
export const referenceDate = "2026-10-03";

/** O telefone do cliente é o WhatsApp. */
export type Client = {
  id: string;
  name: string;
  phone: string;
  whatsappOptIn: boolean;
};

/**
 * Situação de um período (mesmo enum de customer_subscriptions.status):
 * - ativa: o plano cobre e gera mensalidade;
 * - suspensa: plano congelado, não cobre nem gera mensalidade;
 * - cancelada: período anulado no mesmo dia em que começou.
 * Cada mudança de plano ou de situação fecha o período atual e abre outro.
 */
export type PeriodStatus = "ativa" | "suspensa" | "cancelada";

export type Subscription = {
  id: string;
  clientId: string;
  planId: PlanId;
  status: PeriodStatus;
  startedAt: string;
  /** Último dia coberto. `null` enquanto vigente. */
  endedAt: string | null;
};

const clientNames = [
  "André Souza", "Bruno Lacerda", "Caio Ferreira", "Daniel Rocha", "Eduardo Pires",
  "Felipe Moura", "Gabriel Antunes", "Henrique Dias", "Igor Matos", "Jorge Teixeira",
  "Kauã Ribeiro", "Leonardo Prado", "Marcos Vieira", "Nathan Coelho", "Otávio Lima",
  "Paulo Henrique Brandão", "Rafael Quintão", "Samuel Arantes", "Thiago Moreira", "Ulisses Faria",
  "Vinícius Castro", "Wagner Nogueira", "Yuri Campos", "Lucas Gontijo", "Mateus Drummond",
  "Pedro Bicalho", "Ricardo Lanna", "Gustavo Rezende",
];

export const clients: Client[] = clientNames.map((name, index) => ({
  id: `cli-${String(index + 1).padStart(2, "0")}`,
  name,
  phone: `(31) 9${String(8100 + index * 37).padStart(4, "0")}-${String(1000 + index * 263).slice(-4)}`,
  whatsappOptIn: index % 3 !== 2,
}));

// Base ilustrativa (índice em clientNames). `paidThrough`: mensalidades com vencimento
// até essa data estão pagas; as seguintes ficam em aberto. Padrão: tudo pago até hoje.
export const subscriptionSeeds: {
  client: number;
  planId: PlanId;
  startedAt: string;
  endedAt?: string;
  status?: PeriodStatus;
  paidThrough?: string;
}[] = [
  { client: 0, planId: "ouro", startedAt: "2026-02-14" },
  { client: 2, planId: "bronze", startedAt: "2026-05-08" },
  { client: 4, planId: "prata", startedAt: "2026-07-22" },
  // Vencida há 3 dias: pagamento pendente, ainda dentro da tolerância.
  { client: 5, planId: "ouro", startedAt: "2026-04-30", paidThrough: "2026-09-29" },
  { client: 8, planId: "bronze", startedAt: "2026-06-03" },
  { client: 10, planId: "ouro", startedAt: "2025-12-18" },
  // Vencida em 20/09: passou da tolerância, o plano deixa de cobrir a partir de 26/09.
  { client: 13, planId: "prata", startedAt: "2026-06-20", paidThrough: "2026-09-19" },
  { client: 15, planId: "bronze", startedAt: "2026-08-11" },
  { client: 18, planId: "ouro", startedAt: "2026-03-27" },
  // Vencida em 01/10: pendente.
  { client: 20, planId: "bronze", startedAt: "2026-03-01", paidThrough: "2026-09-30" },
  // Congelou o plano em 21/09: o período ativo termina na véspera e o congelado segue aberto.
  { client: 23, planId: "prata", startedAt: "2026-01-09", endedAt: "2026-09-20" },
  { client: 23, planId: "prata", startedAt: "2026-09-21", status: "suspensa" },
  { client: 25, planId: "ouro", startedAt: "2026-08-25" },
  // Ex-assinantes (inativos).
  { client: 1, planId: "ouro", startedAt: "2026-01-10", endedAt: "2026-07-09" },
  { client: 6, planId: "bronze", startedAt: "2026-03-15", endedAt: "2026-08-14" },
  { client: 11, planId: "prata", startedAt: "2025-11-05", endedAt: "2026-05-04" },
  // Cancelou em setembro deixando a última mensalidade em aberto.
  { client: 16, planId: "ouro", startedAt: "2026-05-12", endedAt: "2026-09-11", paidThrough: "2026-08-11" },
];

export const subscriptions: Subscription[] = subscriptionSeeds.map((seed, index) => ({
  id: `ass-${String(index + 1).padStart(2, "0")}`,
  clientId: clients[seed.client].id,
  planId: seed.planId,
  status: seed.status ?? "ativa",
  startedAt: seed.startedAt,
  endedAt: seed.endedAt ?? null,
}));
