import { ShieldAlert } from "lucide-react";
import AdminHeader from "./admin-header";
import SignOutButton from "./sign-out-button";

/** Logado, mas fora da equipe (ex.: assinante) ou com o acesso desativado pelo administrador. */
export function StaffNoAccess() {
  return (
    <div className="admin">
      <AdminHeader showSections={false} />
      <NoAccess
        title="Sem acesso ao painel"
        message="Este login não tem acesso ativo ao painel. Fale com o administrador da barbearia."
        signOut
      />
    </div>
  );
}

/** Cartão "Sem acesso": login fora da equipe ou tela restrita ao administrador. */
export default function NoAccess({
  title,
  message,
  signOut = false,
}: {
  title: string;
  message: string;
  signOut?: boolean;
}) {
  return (
    <main className="admin-main admin-auth">
      <div className="admin-panel admin-auth__card">
        <div className="admin-empty">
          <ShieldAlert aria-hidden="true" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">{title}</p>
          <p>{message}</p>
          {signOut ? <SignOutButton /> : null}
        </div>
      </div>
    </main>
  );
}
