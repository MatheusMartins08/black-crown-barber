import "server-only";
import { createClient } from "@supabase/supabase-js";
import { assertSupabaseEnv, supabaseUrl } from "./env";

/**
 * Cliente com a chave secreta (SUPABASE_SECRET_KEY): ignora a RLS e administra o Auth.
 * Só para Server Actions que já conferiram que quem chama é admin.
 */
export function getSupabaseAdminClient() {
  assertSupabaseEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) return null;
  return createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
