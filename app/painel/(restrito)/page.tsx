import type { Metadata } from "next";
import AdminDashboard from "../components/admin-dashboard";

export const metadata: Metadata = {
  title: "Visão geral | Painel Black Crown Barber",
};

export default function VisaoGeralPage() {
  return <AdminDashboard />;
}
