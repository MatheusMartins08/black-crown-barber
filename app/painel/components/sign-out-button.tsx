"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { signOutStaffAction } from "../auth-actions";

export default function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="admin-header__site-link admin-header__sign-out"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          // Mesmo se a saída falhar (rede), a tela de login confere a sessão que ficou.
          await signOutStaffAction().catch(() => undefined);
          // Navegação completa (veja auth-actions.ts).
          window.location.replace("/painel/entrar");
        })
      }
      type="button"
    >
      Sair
      <LogOut aria-hidden="true" size={14} />
    </button>
  );
}
