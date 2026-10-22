import "server-only";
import type { ShopProfile, ShopStatus } from "../../data/shop";
import { getCurrentShop } from "../../lib/shop";
import { getSupabaseServerClient } from "../../lib/supabase/server";
import type { StaffRole } from "./staff";

type Supabase = Awaited<ReturnType<typeof getSupabaseServerClient>>;

/** Vínculo de quem está logado (RPC staff_context), lido no banco a cada chamada. */
export type StaffContext = {
  shopId: string;
  role: StaffRole;
  isActive: boolean;
  professionalId: string | null;
  shopStatus: ShopStatus;
};

/** session: sem login; not_staff: não é da equipe ativa desta barbearia; read_only: loja suspensa. */
export type ShopStaffRefusal = "session" | "not_staff" | "read_only";

export const shopStaffMessages: Record<Exclude<ShopStaffRefusal, "not_staff">, string> = {
  session: "Sua sessão terminou. Entre novamente no painel.",
  read_only: "A barbearia está suspensa: o painel está só para consulta.",
};

/**
 * Equipe ativa desta barbearia (a do domínio), com a loja ativa, pronta para gravar. Confere
 * no banco, sem cache, antes de gravar e antes de chamar o Auth Admin (service role, que não
 * passa pela RLS): o cache da loja (getCurrentShop) só diz qual é o domínio, nunca quem pode o quê.
 */
export async function checkShopStaff(): Promise<
  { supabase: Supabase; context: StaffContext; shop: ShopProfile } | { refusal: ShopStaffRefusal }
> {
  const supabase = await getSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { refusal: "session" };

  const [{ data, error }, shop] = await Promise.all([supabase.rpc("staff_context"), getCurrentShop()]);
  const context = error ? null : (data as StaffContext | null);
  if (!context || !shop || context.shopId !== shop.id || !context.isActive) return { refusal: "not_staff" };
  if (context.shopStatus !== "ativa") return { refusal: "read_only" };
  return { supabase, context, shop };
}

/** Como checkShopStaff, exigindo o papel de admin. */
export async function checkShopAdmin(): Promise<{ supabase: Supabase; shopId: string } | { refusal: ShopStaffRefusal }> {
  const auth = await checkShopStaff();
  if ("refusal" in auth) return auth;
  if (auth.context.role !== "admin") return { refusal: "not_staff" };
  return { supabase: auth.supabase, shopId: auth.shop.id };
}
