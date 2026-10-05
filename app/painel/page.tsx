import type { Metadata } from "next";
import AdminDashboard from "./components/admin-dashboard";
import AdminHeader from "./components/admin-header";
import "./painel.css";

export const metadata: Metadata = {
  title: "Painel | Black Crown Barber",
  description: "Painel administrativo: agenda, produção da equipe e fechamento.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PainelPage() {
  return (
    <div className="admin">
      <AdminHeader />
      <AdminDashboard />
    </div>
  );
}
