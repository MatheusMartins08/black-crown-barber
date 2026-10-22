import "server-only";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { normalizeHost, type ShopProfile } from "../data/shop";
import { assertSupabaseEnv, supabasePublishableKey, supabaseUrl } from "./supabase/env";

// Qual barbearia esta requisição atende. Vem do domínio (tabela shop_domains); com SHOP_SLUG
// no ambiente, o deploy fica preso a uma loja (uma cópia do template por barbearia, ou o
// localhost no desenvolvimento).
//
// Só o header Host é usado (nunca x-forwarded-host): o proxy reverso deve repassar o Host
// original. Forjar o Host só abre o site público de outra loja; o que é privado é conferido
// no banco (RLS e RPCs). Por isso este cache serve para apresentação e catálogo, nunca para
// autorizar: as Server Actions conferem loja, papel e situação em staff_context(), sem cache.
//
// Dois caches: host -> loja (revalida a cada 60 s: domínio novo) e loja -> perfil (5 min, e o
// painel invalida a tag shop:<id> ao salvar). A revalidação acontece conforme chegam
// requisições, então não há prazo garantido; a regra que vale está no banco.

export const shopTags = {
  domains: "shop-domains",
  host: (host: string) => `shop-host:${host}`,
  profile: (shopId: string) => `shop:${shopId}`,
} as const;

function getPublicClient() {
  assertSupabaseEnv();
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getShopIdByHost(host: string) {
  return unstable_cache(
    async () => {
      const { data, error } = await getPublicClient().rpc("resolve_shop_host", { p_host: host });
      if (error) throw new Error(`Não foi possível identificar a barbearia: ${error.message}`);
      return (data as string | null) ?? null;
    },
    ["shop-by-host", host],
    { tags: [shopTags.domains, shopTags.host(host)], revalidate: 60 },
  )();
}

function getShopIdBySlug(slug: string) {
  return unstable_cache(
    async () => {
      const { data, error } = await getPublicClient().rpc("resolve_shop_slug", { p_slug: slug });
      if (error) throw new Error(`Não foi possível identificar a barbearia: ${error.message}`);
      return (data as string | null) ?? null;
    },
    ["shop-by-slug", slug],
    { tags: [shopTags.domains], revalidate: 60 },
  )();
}

export function getShopProfile(shopId: string) {
  return unstable_cache(
    async () => {
      const { data, error } = await getPublicClient().rpc("get_shop_profile", { p_shop: shopId });
      if (error) throw new Error(`Não foi possível carregar a barbearia: ${error.message}`);
      return (data as ShopProfile | null) ?? null;
    },
    ["shop-profile", shopId],
    { tags: [shopTags.profile(shopId)], revalidate: 300 },
  )();
}

/**
 * Loja desta requisição (com a situação: cada tela decide o que fazer se estiver suspensa)
 * ou null se o domínio não for de nenhuma barbearia. Memorizada por requisição.
 */
export const getCurrentShop = cache(async (): Promise<ShopProfile | null> => {
  // headers() sempre, mesmo com SHOP_SLUG: a página fica dinâmica e nunca vai para o build já
  // presa a uma loja (o build não sabe em que domínio vai rodar). O catálogo e o perfil
  // continuam em cache. headers() fica fora do unstable_cache: o host entra como argumento.
  const host = normalizeHost((await headers()).get("host"));
  const pinned = process.env.SHOP_SLUG?.trim().toLowerCase();
  const shopId = pinned ? await getShopIdBySlug(pinned) : host ? await getShopIdByHost(host) : null;
  return shopId ? getShopProfile(shopId) : null;
});

/** Loja desta requisição ou 404 (domínio desconhecido nunca cai numa loja padrão). */
export async function requireCurrentShop() {
  const shop = await getCurrentShop();
  if (!shop) notFound();
  return shop;
}
