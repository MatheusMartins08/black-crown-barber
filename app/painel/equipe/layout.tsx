import type { Metadata } from "next";
import type { ReactNode } from "react";
import AdminHeader from "../components/admin-header";
import { StaffNoAccess } from "../components/no-access";
import { PainelCatalogProvider } from "../components/painel-catalog";
import { getStaffProfessionals, getStaffSchedule, getTeamServices, requireStaff } from "../lib/staff";
import "../painel.css";

export const metadata: Metadata = {
  title: "Painel dos barbeiros | Black Crown Barber",
  description: "Agenda da equipe e horário de cada barbeiro.",
  robots: {
    index: false,
    follow: false,
  },
};

// Painel dos barbeiros: o mesmo para todos, identificado pelo login. Só operação: o catálogo
// vai sem planos, comissão ou repasse (e o banco nem os entrega ao barbeiro). O admin é levado
// ao painel dele; cada página confere o papel de novo.
export default async function EquipeLayout({ children }: { children: ReactNode }) {
  const current = await requireStaff("barbeiro");
  if (!current) return <StaffNoAccess />;

  const { staff, email } = current;
  const [professionals, services, schedule] = await Promise.all([
    getStaffProfessionals(),
    getTeamServices(),
    getStaffSchedule(),
  ]);

  return (
    <div className="admin">
      <AdminHeader role="barbeiro" userLabel={`${staff.displayName || staff.login || email} · Barbeiro`} />
      <PainelCatalogProvider
        exceptions={schedule.exceptions}
        openingPeriods={schedule.periods}
        plans={[]}
        professionals={professionals}
        services={services}
        walkInRate={0}
      >
        {children}
      </PainelCatalogProvider>
    </div>
  );
}
