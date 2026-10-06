import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSupabaseEnv, supabasePublishableKey, supabaseUrl } from "./env";

// Cliente do navegador. A sessão fica em cookie, então o servidor (proxy e páginas)
// enxerga o mesmo login. Uma instância por aba.
let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient() {
  if (!browserClient) {
    assertSupabaseEnv();
    browserClient = createBrowserClient(supabaseUrl, supabasePublishableKey);
  }
  return browserClient;
}
