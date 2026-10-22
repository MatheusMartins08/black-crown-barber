"use client";

import { setBrowserShopId } from "../lib/browser-shop";

/**
 * Define a barbearia da aba antes dos componentes abaixo dele rodarem efeitos ou chamarem
 * RPCs. No servidor não faz nada: lá o valor seria compartilhado entre requisições de lojas
 * diferentes.
 */
export default function ShopScope({ shopId }: { shopId: string }) {
  if (typeof window !== "undefined") setBrowserShopId(shopId);
  return null;
}
