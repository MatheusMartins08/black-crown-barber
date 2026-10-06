"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await getSupabaseBrowserClient().auth.signOut();
    router.replace("/painel/entrar");
    router.refresh();
  }

  return (
    <button className="admin-header__site-link admin-header__sign-out" disabled={pending} onClick={signOut} type="button">
      Sair
      <LogOut aria-hidden="true" size={14} />
    </button>
  );
}
