import "server-only";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { professionalColumns, sortProfessionals, toProfessional, type ProfessionalRow } from "../data/professionals";
import { assertSupabaseEnv, supabasePublishableKey, supabaseUrl } from "./supabase/env";

// Catálogo público do site (landing e agendamento), lido como visitante: a RLS só
// devolve o que está ativo. Fica em cache entre requisições; o painel invalida a tag ao
// salvar (updateTag em app/painel/site-actions.ts) e a hora é só uma rede de segurança.

export const catalogTags = { professionals: "catalog:professionals" } as const;

function getPublicClient() {
  assertSupabaseEnv();
  // Sem cookies nem sessão: o resultado é o mesmo para qualquer visitante e pode ser compartilhado.
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Profissionais ativos, na ordem de exibição, com os serviços que atendem. */
export const getPublicProfessionals = unstable_cache(
  async () => {
    const { data, error } = await getPublicClient()
      .from("professionals")
      .select(professionalColumns)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order")
      .order("name");
    if (error) throw new Error(`Não foi possível carregar a equipe: ${error.message}`);
    return sortProfessionals((data as unknown as ProfessionalRow[]).map(toProfessional));
  },
  ["catalog-professionals"],
  { tags: [catalogTags.professionals], revalidate: 3600 },
);
