import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getSupabaseServerClient } from "../lib/supabase/server";
import AdminDashboard from "./components/admin-dashboard";
import AdminHeader from "./components/admin-header";
import SignOutButton from "./components/sign-out-button";
import "./painel.css";

export const metadata: Metadata = {
  title: "Painel | Black Crown Barber",
  description: "Painel administrativo: agenda, produção da equipe e fechamento.",
  robots: {
    index: false,
    follow: false,
  },
};

const roleLabels = { admin: "Administrador", barbeiro: "Barbeiro" } as const;

export default async function PainelPage() {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/painel/entrar");

  // A própria linha em staff_members (a RLS deixa cada um ler a sua). Os dados do painel
  // continuam protegidos pela RLS no banco; isto só decide o que mostrar.
  const { data: staff } = await supabase
    .from("staff_members")
    .select("role, display_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (!staff) {
    return (
      <div className="admin">
        <AdminHeader showSections={false} />
        <main className="admin-main admin-auth">
          <div className="admin-panel admin-auth__card">
            <div className="admin-empty">
              <ShieldAlert aria-hidden="true" size={22} strokeWidth={1.6} />
              <p className="admin-empty__title">Sem acesso ao painel</p>
              <p>Este login não faz parte da equipe. Peça ao administrador para liberar o seu acesso.</p>
              <SignOutButton />
            </div>
          </div>
        </main>
      </div>
    );
  }

  const role = staff.role as keyof typeof roleLabels;
  const name = staff.display_name || (typeof data.claims.email === "string" ? data.claims.email : "");

  return (
    <div className="admin">
      <AdminHeader userLabel={`${name} · ${roleLabels[role] ?? role}`} />
      <AdminDashboard />
    </div>
  );
}
