"use client";

import { useState, useTransition, type FormEvent } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { signInStaffAction } from "../auth-actions";

/** Um login só para a equipe: o servidor confere o papel e leva cada um para o seu painel. */
export default function StaffSignInForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!identifier.trim() || !password) {
      setError("Informe o usuário (ou e-mail) e a senha.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        // Com sucesso, a ação redireciona para o painel do papel (sem resultado para mostrar).
        const result = await signInStaffAction(identifier, password);
        if (result && !result.ok) setError(result.message);
      } catch {
        setError("Não foi possível falar com o servidor. Verifique a conexão e tente de novo.");
      }
    });
  }

  return (
    <form className="admin-auth__form" noValidate onSubmit={submit}>
      <label className="admin-field">
        <span>Usuário ou e-mail</span>
        <input
          autoCapitalize="none"
          autoComplete="username"
          onChange={(event) => setIdentifier(event.target.value)}
          spellCheck={false}
          type="text"
          value={identifier}
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
