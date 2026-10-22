// Barbearia da aba no navegador. Cada aba atende um único domínio, logo uma única loja: o
// layout define o id uma vez (ShopScope) e os adaptadores das RPCs (booking-api,
// subscribers-api) o mandam em p_shop. O banco confere de novo se a loja existe e está ativa.

let currentShopId: string | null = null;

export function setBrowserShopId(shopId: string) {
  currentShopId = shopId;
}

export function getBrowserShopId() {
  if (!currentShopId) throw new Error("Barbearia não identificada. Recarregue a página.");
  return currentShopId;
}
