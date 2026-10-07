// Profissionais da barbearia (tabela professionals). Única fonte para a landing, o
// agendamento e o painel: os dados chegam do Supabase por app/lib/catalog.ts (site) e
// pelo layout do painel. Puro (sem React e sem rede).

export type Professional = {
  /** uuid estável: é o que agendamentos, bloqueios e fechamento referenciam. */
  id: string;
  /** Identificador público (links "?profissional=" e RPCs do agendamento). Fixo depois de criado. */
  slug: string;
  name: string;
  specialty: string;
  description: string;
  /** Caminho local (/barber-julia.jpg) ou URL pública do bucket site-media. */
  imageUrl: string | null;
  imageAlt: string;
  /** object-position da foto, ex.: "50% 36%". */
  imagePosition: string;
  isActive: boolean;
  /**
   * Excluído pelo painel com histórico (ISO). Some do site, do agendamento e das listas do
   * painel; continua nos atendimentos e no fechamento dos períodos em que atendeu.
   */
  deletedAt: string | null;
  sortOrder: number;
  /** Slugs dos serviços que o profissional atende (professional_services). */
  serviceIds: string[];
};

export type ProfessionalRow = {
  id: string;
  slug: string;
  name: string;
  specialty: string | null;
  description: string | null;
  image_url: string | null;
  image_alt: string | null;
  image_position: string | null;
  is_active: boolean;
  deleted_at: string | null;
  sort_order: number;
  professional_services?: { services: { slug: string } | null }[];
};

export const professionalColumns =
  "id, slug, name, specialty, description, image_url, image_alt, image_position, is_active, deleted_at, sort_order, professional_services(services(slug))";

export const defaultImagePosition = "50% 50%";

export function toProfessional(row: ProfessionalRow): Professional {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    specialty: row.specialty ?? "",
    description: row.description ?? "",
    imageUrl: row.image_url,
    imageAlt: row.image_alt ?? "",
    imagePosition: row.image_position || defaultImagePosition,
    isActive: row.is_active,
    deletedAt: row.deleted_at,
    sortOrder: row.sort_order,
    serviceIds: (row.professional_services ?? []).flatMap((item) => (item.services ? [item.services.slug] : [])),
  };
}

export function sortProfessionals(list: Professional[]) {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR"));
}

/** "Rafael Martins" -> "Rafael" (chamadas como "Agendar com Rafael"). */
export function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

// --- Cadastro no painel ---

export const professionalLimits = { name: 60, specialty: 60, description: 220 };

export type ProfessionalInput = {
  name: string;
  specialty: string;
  description: string;
  /** Posição vertical da foto, 0 a 100 (%). */
  imagePositionY: number;
};

export type ProfessionalErrors = Partial<Record<"name" | "specialty" | "description", string>>;

export function validateProfessional(input: ProfessionalInput): ProfessionalErrors {
  const errors: ProfessionalErrors = {};
  const name = input.name.trim();
  if (name.length < 2) errors.name = "Informe o nome do profissional.";
  else if (name.length > professionalLimits.name) errors.name = `Use até ${professionalLimits.name} caracteres.`;
  if (input.specialty.trim().length > professionalLimits.specialty) {
    errors.specialty = `Use até ${professionalLimits.specialty} caracteres.`;
  }
  if (input.description.trim().length > professionalLimits.description) {
    errors.description = `Use até ${professionalLimits.description} caracteres.`;
  }
  return errors;
}

/** "50% 36%" -> 36. */
export function getPositionY(position: string) {
  const value = Number(position.trim().split(/\s+/)[1]?.replace("%", ""));
  return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 50;
}

export function toImagePosition(positionY: number) {
  return `50% ${Math.min(100, Math.max(0, Math.round(positionY)))}%`;
}

/** Slug a partir do nome: primeiro nome; se já existir, nome completo; depois sufixo numérico. */
export function createSlug(name: string, taken: readonly string[]) {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const reserved = new Set([...taken, "qualquer"]);
  const first = normalize(getFirstName(name)) || "profissional";
  const full = normalize(name) || first;
  for (const candidate of [first, full]) {
    if (!reserved.has(candidate)) return candidate;
  }
  for (let index = 2; ; index += 1) {
    const candidate = `${full}-${index}`;
    if (!reserved.has(candidate)) return candidate;
  }
}

/** Texto alternativo padrão de uma foto nova. */
export function getDefaultImageAlt(name: string) {
  return `Retrato de ${name.trim()}`;
}
