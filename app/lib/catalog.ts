import "server-only";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { openingPeriodColumns, sortPeriods, toOpeningPeriod, type OpeningPeriodRow } from "../data/hours";
import { planColumns, sortPlans, toPlan, type PlanRow } from "../data/plans";
import { professionalColumns, sortProfessionals, toProfessional, type ProfessionalRow } from "../data/professionals";
import { serviceColumns, sortServices, toService, type ServiceRow } from "../data/services";
import { siteImageColumns, toSiteImage, type SiteImageRow } from "../data/site-images";
import { assertSupabaseEnv, supabasePublishableKey, supabaseUrl } from "./supabase/env";

// Catálogo público do site (landing e agendamento), lido como visitante: a RLS só
// devolve o que está ativo. Fica em cache entre requisições; o painel invalida a tag ao
// salvar (updateTag em app/painel/site-actions.ts) e a hora é só uma rede de segurança.

export const catalogTags = {
  professionals: "catalog:professionals",
  siteImages: "catalog:site-images",
  services: "catalog:services",
  plans: "catalog:plans",
  hours: "catalog:hours",
} as const;

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

/** Imagens editáveis da landing (galeria e foto da barbearia), na ordem do site. */
export const getPublicSiteImages = unstable_cache(
  async () => {
    const { data, error } = await getPublicClient().from("site_images").select(siteImageColumns).order("sort_order");
    if (error) throw new Error(`Não foi possível carregar as imagens do site: ${error.message}`);
    return (data as SiteImageRow[]).map(toSiteImage);
  },
  ["catalog-site-images"],
  { tags: [catalogTags.siteImages], revalidate: 3600 },
);

/** Serviços ativos, na ordem de exibição (landing e agendamento). Sem o repasse da equipe. */
export const getPublicServices = unstable_cache(
  async () => {
    const { data, error } = await getPublicClient()
      .from("services")
      .select(serviceColumns)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order")
      .order("name");
    if (error) throw new Error(`Não foi possível carregar os serviços: ${error.message}`);
    return sortServices((data as unknown as ServiceRow[]).map(toService));
  },
  ["catalog-services"],
  { tags: [catalogTags.services], revalidate: 3600 },
);

/**
 * Planos não excluídos (ativos e inativos: o assinante de um plano inativado continua vendo o
 * próprio plano no agendamento), com os serviços incluídos.
 */
export const getPublicPlans = unstable_cache(
  async () => {
    const { data, error } = await getPublicClient()
      .from("subscription_plans")
      .select(planColumns)
      .is("deleted_at", null)
      .order("sort_order");
    if (error) throw new Error(`Não foi possível carregar os planos: ${error.message}`);
    return sortPlans((data as unknown as PlanRow[]).map(toPlan));
  },
  ["catalog-plans"],
  { tags: [catalogTags.plans], revalidate: 3600 },
);

/** Horário semanal (um ou mais períodos por dia). As exceções não são públicas. */
export const getPublicOpeningPeriods = unstable_cache(
  async () => {
    const { data, error } = await getPublicClient().from("opening_periods").select(openingPeriodColumns);
    if (error) throw new Error(`Não foi possível carregar o horário: ${error.message}`);
    return sortPeriods((data as OpeningPeriodRow[]).map(toOpeningPeriod));
  },
  ["catalog-hours"],
  { tags: [catalogTags.hours], revalidate: 3600 },
);
