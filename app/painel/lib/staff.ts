import "server-only";
import { cache } from "react";
import {
  professionalColumns,
  sortProfessionals,
  toProfessional,
  type ProfessionalRow,
} from "../../data/professionals";
import { getSupabaseServerClient } from "../../lib/supabase/server";

export type StaffRole = "admin" | "barbeiro";

/**
 * Usuário logado e a própria linha em staff_members (a RLS deixa cada um ler a sua).
 * Memorizado por requisição: o layout e a página compartilham a mesma consulta. Só
 * decide o que mostrar; os dados continuam protegidos pela RLS no banco.
 */
export const getCurrentStaff = cache(async () => {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: staff } = await supabase
    .from("staff_members")
    .select("role, display_name")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    email: typeof data.claims.email === "string" ? data.claims.email : "",
    staff: staff as { role: StaffRole; display_name: string | null } | null,
  };
});

export type ProfessionalUsage = {
  /** Tem atendimentos, bloqueios de agenda ou login: a exclusão mantém o cadastro só para o histórico. */
  hasHistory: boolean;
  /** Tem login de barbeiro no painel (é removido junto com a exclusão). */
  hasLogin: boolean;
  /** Horários "agendado" daqui para frente (continuam na agenda se for inativado ou excluído). */
  upcoming: number;
};

/** Uso de cada profissional (id → uso), para a tela Edição do site > Barbeiros. */
export async function getProfessionalUsage(): Promise<Record<string, ProfessionalUsage>> {
  const supabase = await getSupabaseServerClient();
  const [appointments, blocks, logins] = await Promise.all([
    supabase.from("appointments").select("booked_professional_id, performed_by_id, status, starts_at"),
    supabase.from("schedule_blocks").select("professional_id"),
    supabase.from("staff_members").select("professional_id").not("professional_id", "is", null),
  ]);
  if (appointments.error || blocks.error || logins.error) {
    throw new Error("Não foi possível carregar o histórico da equipe.");
  }

  const usage: Record<string, ProfessionalUsage> = {};
  const entry = (id: string) => (usage[id] ??= { hasHistory: false, hasLogin: false, upcoming: 0 });
  const now = Date.now();

  for (const row of appointments.data) {
    entry(row.booked_professional_id).hasHistory = true;
    entry(row.performed_by_id).hasHistory = true;
    if (row.status === "agendado" && new Date(row.starts_at).getTime() >= now) entry(row.performed_by_id).upcoming += 1;
  }
  for (const row of blocks.data) entry(row.professional_id).hasHistory = true;
  for (const row of logins.data) {
    if (!row.professional_id) continue;
    entry(row.professional_id).hasHistory = true;
    entry(row.professional_id).hasLogin = true;
  }
  return usage;
}

/**
 * Todos os profissionais, inclusive inativos (a RLS mostra os inativos só para a equipe):
 * o histórico da agenda e do fechamento continua apontando para eles.
 */
export const getStaffProfessionals = cache(async () => {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("professionals").select(professionalColumns).order("sort_order");
  if (error) throw new Error(`Não foi possível carregar a equipe: ${error.message}`);
  return sortProfessionals((data as unknown as ProfessionalRow[]).map(toProfessional));
});
