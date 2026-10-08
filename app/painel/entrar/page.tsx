import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminHeader from "../components/admin-header";
import { getCurrentStaff, staffHome } from "../lib/staff";
import StaffSignInForm from "./staff-sign-in-form";
import "../painel.css";

export const metadata: Metadata = {
  title: "Entrar | Painel Black Crown Barber",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function EntrarPage() {
  // Quem já está logado com acesso ativo vai direto para o painel do seu papel. Sem sessão,
  // com login fora da equipe ou acesso desativado, mostra o formulário (sem redirecionar de
  // volta: o proxy e esta página usam a mesma checagem, então não há vaivém).
  const current = await getCurrentStaff();
  if (current?.staff?.isActive) redirect(staffHome[current.staff.role]);

  return (
    <div className="admin">
      <AdminHeader showSections={false} />
      <main className="admin-main admin-auth">
        <section aria-labelledby="entrar-title" className="admin-panel admin-auth__card">
          <div className="admin-panel__heading">
            <div>
              <h1 id="entrar-title">Entrar no painel</h1>
              <p>Acesso da equipe da barbearia. Barbeiros entram com o usuário criado pelo administrador.</p>
            </div>
          </div>
          <StaffSignInForm />
        </section>
      </main>
    </div>
  );
}
