import type { Metadata } from "next";
import AdminHeader from "../components/admin-header";
import StaffSignInForm from "./staff-sign-in-form";
import "../painel.css";

export const metadata: Metadata = {
  title: "Entrar | Painel Black Crown Barber",
  robots: {
    index: false,
    follow: false,
  },
};

export default function EntrarPage() {
  return (
    <div className="admin">
      <AdminHeader showSections={false} />
      <main className="admin-main admin-auth">
        <section aria-labelledby="entrar-title" className="admin-panel admin-auth__card">
          <div className="admin-panel__heading">
            <div>
              <h1 id="entrar-title">Entrar no painel</h1>
              <p>Acesso da equipe da barbearia.</p>
            </div>
          </div>
          <StaffSignInForm />
        </section>
      </main>
    </div>
  );
}
