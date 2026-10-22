import "server-only";
import type { getSupabaseAdminClient } from "../../lib/supabase/admin";

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

/** equipe: login do painel; assinante: login do agendamento. */
export type IdentityKind = "equipe" | "assinante";

/**
 * Dono de um login no Supabase Auth. Fica em app_metadata, que só o servidor (service role)
 * grava: o admin de uma loja não consegue declarar que um login de outra loja é dele. O banco
 * exige o mesmo par loja/tipo ao ligar user_id a customers e staff_members
 * (…20261022150000_identity_binding_and_consent.sql).
 */
export function identityMetadata(shopId: string, kind: IdentityKind) {
  return { shop_id: shopId, kind };
}

/**
 * Confere no Auth, antes de trocar senha, e-mail ou bloqueio com a service role, se o login é
 * desta loja e deste tipo. A linha local (customers/staff_members) não basta como prova.
 */
export async function isShopIdentity(admin: AdminClient, userId: string, shopId: string, kind: IdentityKind) {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  const metadata = data?.user?.app_metadata;
  return !error && metadata?.shop_id === shopId && metadata?.kind === kind;
}
