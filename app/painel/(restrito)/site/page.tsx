import type { Metadata } from "next";
import SiteEditorWorkspace from "../../components/site-editor-workspace";
import { requireCurrentShop } from "../../../lib/shop";
import {
  getBarberAccess,
  getEditableSiteImages,
  getPlanUsage,
  getProfessionalUsage,
  getServiceUsage,
  requireStaff,
} from "../../lib/staff";

export const metadata: Metadata = {
  title: "Edição do site | Painel",
};

export default async function SiteEditorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Só o administrador (o barbeiro é redirecionado ao painel dele); a escrita confere de novo
  // nas Server Actions e na RLS.
  if (!(await requireStaff("admin"))) return null;

  // ?aba=imagens (ou barbeiros, servicos, horarios, planos) abre direto na aba; o componente valida.
  const [{ aba }, usage, siteImages, serviceUsage, planUsage, barberAccess, shop] = await Promise.all([
    searchParams,
    getProfessionalUsage(),
    getEditableSiteImages(),
    getServiceUsage(),
    getPlanUsage(),
    getBarberAccess(),
    requireCurrentShop(),
  ]);
  return (
    <SiteEditorWorkspace
      barberAccess={barberAccess}
      initialTab={typeof aba === "string" ? aba : undefined}
      planUsage={planUsage}
      professionalUsage={usage}
      serviceUsage={serviceUsage}
      shopDetails={{
        name: shop.name,
        description: shop.description,
        address: shop.address,
        city: shop.city,
        phone: shop.phone,
        whatsapp: shop.whatsapp,
        instagram: shop.instagram,
        mapsUrl: shop.mapsUrl,
      }}
      siteImages={siteImages}
    />
  );
}
