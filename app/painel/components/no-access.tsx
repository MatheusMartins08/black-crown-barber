import { ShieldAlert } from "lucide-react";
import SignOutButton from "./sign-out-button";

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
