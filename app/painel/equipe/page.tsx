import type { Metadata } from "next";
import TeamDashboard from "../components/team-dashboard";
import { requireStaff } from "../lib/staff";

export const metadata: Metadata = {
  title: "Visão geral | Painel dos barbeiros",
};

export default async function EquipeVisaoGeralPage() {
  // O layout confere o papel, mas não roda de novo a cada navegação: a página confere também.
  const current = await requireStaff("barbeiro");
  if (!current) return null;
  return <TeamDashboard professionalId={current.staff.professionalId} />;
}
