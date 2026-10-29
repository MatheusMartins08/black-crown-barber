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

/** Minutos desde a meia-noite no relógio da barbearia. */
export function getShopMinutes(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" })
    .formatToParts(now)
    .reduce<Record<string, string>>((all, part) => ({ ...all, [part.type]: part.value }), {});
  return Number(parts.hour) * 60 + Number(parts.minute);
}

/** Data e hora na barbearia ("2026-10-28", "14:30") -> instante ISO (UTC), para gravar starts_at. */
export function getShopInstant(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hours, minutes);
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  // Diferença entre o relógio da loja e o UTC naquele instante (considera horário de verão).
  const offsetAt = (instant: number) => {
    const parts = Object.fromEntries(format.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - instant;
  };
  const first = wallClock - offsetAt(wallClock);
  return new Date(wallClock - offsetAt(first)).toISOString();
}

// Dados da barbearia (shop_settings), editados no painel em Edição do site > Barbearia.

export type ShopDetails = Pick<
  ShopProfile,
  "name" | "description" | "address" | "city" | "phone" | "whatsapp" | "instagram" | "mapsUrl"
>;

export type ShopDetailsInput = Record<keyof ShopDetails, string>;
export type ShopDetailsErrors = Partial<Record<keyof ShopDetails, string>>;

export const shopDetailsLimits = { name: 80, description: 300, address: 160, city: 80, mapsUrl: 500 };

/** "@blackcrown", "blackcrown" ou o link do perfil -> "@blackcrown". Vazio ou inválido -> null. */
export function normalizeInstagram(value: string) {
  const handle = value
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? `@${handle}` : null;
}

const phoneDigits = (value: string) => value.replace(/\D/g, "");

export function validateShopDetails(input: ShopDetailsInput): ShopDetailsErrors {
  const errors: ShopDetailsErrors = {};
  const name = input.name.trim();
  if (name.length < 2) errors.name = "Informe o nome da barbearia.";
  else if (name.length > shopDetailsLimits.name) errors.name = `Use até ${shopDetailsLimits.name} caracteres.`;

  for (const field of ["description", "address", "city"] as const) {
    if (input[field].trim().length > shopDetailsLimits[field]) errors[field] = `Use até ${shopDetailsLimits[field]} caracteres.`;
  }

  for (const field of ["phone", "whatsapp"] as const) {
    const digits = phoneDigits(input[field]);
    if (digits && !/^\d{10,11}$/.test(digits)) errors[field] = "Informe o número com DDD, como (31) 99999-9999.";
  }

  if (input.instagram.trim() && !normalizeInstagram(input.instagram)) {
    errors.instagram = "Informe o perfil, como @barbearia.";
  }

  const mapsUrl = input.mapsUrl.trim();
  if (mapsUrl && (!/^https:\/\/\S+$/.test(mapsUrl) || mapsUrl.length > shopDetailsLimits.mapsUrl)) {
    errors.mapsUrl = "Cole o link completo do Google Maps, começando com https://.";
  }
  return errors;
}
