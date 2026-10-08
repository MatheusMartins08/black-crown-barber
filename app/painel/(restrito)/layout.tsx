import type { Metadata } from "next";
import type { ReactNode } from "react";
import AdminHeader from "../components/admin-header";
import { StaffNoAccess } from "../components/no-access";
import { PainelCatalogProvider } from "../components/painel-catalog";
import {
  requireStaff,
  getStaffPlans,
  getStaffProfessionals,
  getStaffSchedule,
  getStaffServices,
  getWalkInRate,
} from "../lib/staff";
import "../painel.css";

export const metadata: Metadata = {
  title: "Painel | Black Crown Barber",
  description: "Painel administrativo: agenda, clientes e fechamento da equipe.",
  robots: {
    index: false,
    follow: false,
  },
};

const roleLabels = { admin: "Administrador", barbeiro: "Barbeiro" } as const;

// Painel do admin: Visão geral, Clientes, Fechamento e Edição do site compartilham o
// cabeçalho, que continua montado ao trocar de tela. Só o admin entra (o barbeiro é levado ao
// painel dos barbeiros); cada página confere de novo, e o banco também (RLS).
export default async function PainelLayout({ children }: { children: ReactNode }) {
  const current = await requireStaff("admin");
  if (!current) return <StaffNoAccess />;

  const { staff, email } = current;
  const name = staff.displayName || email;
  const [professionals, services, plans, walkInRate, schedule] = await Promise.all([
    getStaffProfessionals(),
    getStaffServices(),
    getStaffPlans(),
    getWalkInRate(),
    getStaffSchedule(),
  ]);

  return (
    <div className="admin">
      <AdminHeader role={staff.role} userLabel={`${name} · ${roleLabels[staff.role] ?? staff.role}`} />
      <PainelCatalogProvider
        exceptions={schedule.exceptions}
        openingPeriods={schedule.periods}
        plans={plans}
        professionals={professionals}
        services={services}
        walkInRate={walkInRate}
      >
        {children}
      </PainelCatalogProvider>
    </div>
  );
}
