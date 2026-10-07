import "server-only";
import { cache } from "react";
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
