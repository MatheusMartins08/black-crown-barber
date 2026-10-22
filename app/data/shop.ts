// Barbearias da plataforma (multi-tenant). Puro: usado no servidor e no navegador.
// Cada barbearia é resolvida pelo domínio da requisição (shop_domains) e tem o próprio
// perfil público (RPC get_shop_profile): o que aparece no site e as regras de agendamento.

/** ativa: tudo funciona; suspensa: site fora do ar e painel só para consulta; cancelada: nada. */
export type ShopStatus = "ativa" | "suspensa" | "cancelada";

export type ShopProfile = {
  id: string;
  slug: string;
  status: ShopStatus;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  mapsUrl: string | null;
  timezone: string;
  bookingWindowDays: number;
  slotIntervalMinutes: number;
  minLeadMinutes: number;
  cancelMinNoticeMinutes: number;
};

const hostPattern = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

/** "Teste.Localhost:3000." -> "teste.localhost". Host inválido -> null. */
export function normalizeHost(value: string | null | undefined) {
  const host = (value ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  return host.length <= 253 && hostPattern.test(host) ? host : null;
}

/** Data de hoje (aaaa-mm-dd) no fuso da barbearia, não no do servidor nem no do navegador. */
export function getShopToday(timezone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
}
