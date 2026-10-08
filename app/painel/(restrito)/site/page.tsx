import type { Metadata } from "next";
import SiteEditorWorkspace from "../../components/site-editor-workspace";
import {
  getBarberAccess,
  getEditableSiteImages,
  getPlanUsage,
  getProfessionalUsage,
  getServiceUsage,
  requireStaff,
} from "../../lib/staff";

export const metadata: Metadata = {
  title: "Edição do site | Painel Black Crown Barber",
};

export default async function SiteEditorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Só o administrador (o barbeiro é redirecionado ao painel dele); a escrita confere de novo
  // nas Server Actions e na RLS.
  if (!(await requireStaff("admin"))) return null;

  // ?aba=barbeiros (ou servicos, horarios, planos) abre direto na aba; o componente valida.
  const [{ aba }, usage, siteImages, serviceUsage, planUsage, barberAccess] = await Promise.all([
    searchParams,
    getProfessionalUsage(),
    getEditableSiteImages(),
    getServiceUsage(),
    getPlanUsage(),
    getBarberAccess(),
  ]);
  return (
    <SiteEditorWorkspace
      barberAccess={barberAccess}
      initialTab={typeof aba === "string" ? aba : undefined}
      planUsage={planUsage}
      professionalUsage={usage}
      serviceUsage={serviceUsage}
      siteImages={siteImages}
    />
  );
}
