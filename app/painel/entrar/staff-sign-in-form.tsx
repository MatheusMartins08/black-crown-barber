"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

export default function StaffSignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("Informe o e-mail e a senha.");
      return;
    }

    setPending(true);
    setError(null);
    const { error: signInError } = await getSupabaseBrowserClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setPending(false);
      setError(
        signInError.status === 429
          ? "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo."
          : "E-mail ou senha incorretos.",
      );
      return;
    }

    router.replace("/painel");
    router.refresh();
  }

  return (
    <form className="admin-auth__form" noValidate onSubmit={submit}>
      <label className="admin-field">
        <span>E-mail</span>
        <input
          autoCapitalize="none"
          autoComplete="email"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          spellCheck={false}
          type="email"
          value={email}
        />
      </label>
      <label className="admin-field">
        <span>Senha</span>
        <input
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
      </label>

      {error ? (
        <p className="admin-auth__error" role="alert">
          <CircleAlert aria-hidden="true" size={15} />
          {error}
        </p>
      ) : null}

      <button className="button button--compact admin-action admin-auth__submit" disabled={pending} type="submit">
        {pending ? <LoaderCircle aria-hidden="true" className="admin-spinner" size={16} /> : null}
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
