import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import AdminHeader from "../components/admin-header";
import NoAccess from "../components/no-access";
import { getCurrentStaff } from "../lib/staff";
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

// Área logada do painel: Visão geral, Clientes, Fechamento e Edição do site compartilham
// o cabeçalho, que continua montado ao trocar de tela.
export default async function PainelLayout({ children }: { children: ReactNode }) {
  const current = await getCurrentStaff();
  if (!current) redirect("/painel/entrar");

  const { staff, email } = current;
  if (!staff) {
    return (
      <div className="admin">
        <AdminHeader showSections={false} />
        <NoAccess
          title="Sem acesso ao painel"
          message="Este login não faz parte da equipe. Peça ao administrador para liberar o seu acesso."
          signOut
        />
      </div>
    );
  }

  const name = staff.display_name || email;

  return (
    <div className="admin">
      <AdminHeader role={staff.role} userLabel={`${name} · ${roleLabels[staff.role] ?? staff.role}`} />
      {children}
    </div>
  );
}
