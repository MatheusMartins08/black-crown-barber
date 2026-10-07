import type { Metadata } from "next";
import NoAccess from "../../components/no-access";
import SiteEditorWorkspace from "../../components/site-editor-workspace";
import {
  getCurrentStaff,
  getEditableSiteImages,
  getPlanUsage,
  getProfessionalUsage,
  getServiceUsage,
} from "../../lib/staff";

export const metadata: Metadata = {
  title: "Edição do site | Painel Black Crown Barber",
};

export default async function SiteEditorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // O layout já garante login e equipe; esta tela é só do administrador. O menu esconde o
  // link para o barbeiro, mas a checagem de verdade é aqui (e, na escrita, na RLS).
  const current = await getCurrentStaff();
  if (current?.staff?.role !== "admin") {
    return <NoAccess title="Sem acesso a esta tela" message="Só o administrador edita o conteúdo do site." />;
  }

  // ?aba=barbeiros (ou servicos, horarios, planos) abre direto na aba; o componente valida.
  const [{ aba }, usage, siteImages, serviceUsage, planUsage] = await Promise.all([
    searchParams,
    getProfessionalUsage(),
    getEditableSiteImages(),
    getServiceUsage(),
    getPlanUsage(),
  ]);
  return (
    <SiteEditorWorkspace
      initialTab={typeof aba === "string" ? aba : undefined}
      planUsage={planUsage}
      professionalUsage={usage}
      serviceUsage={serviceUsage}
      siteImages={siteImages}
    />
  );
}
