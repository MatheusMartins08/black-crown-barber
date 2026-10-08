import type { Metadata } from "next";
import AdminDashboard from "../components/admin-dashboard";
import { requireStaff } from "../lib/staff";

export const metadata: Metadata = {
  title: "Visão geral | Painel Black Crown Barber",
};

export default async function VisaoGeralPage() {
  // O layout confere o papel, mas não roda de novo a cada navegação: a página confere também.
  if (!(await requireStaff("admin"))) return null;
  return <AdminDashboard />;
}
