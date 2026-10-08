"use client";

import { useId, useState, useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, KeyRound, LoaderCircle, Power, UserRound } from "lucide-react";
import {
  normalizeStaffLogin,
  staffLoginRules,
  staffPasswordRules,
  validateStaffLogin,
  validateStaffPassword,
} from "../../data/staff";
import type { BarberAccess } from "../lib/staff";
import type { SiteActionResult } from "../site-actions";
import {
  createBarberAccessAction,
  resetBarberPasswordAction,
  setBarberAccessActiveAction,
  updateBarberLoginAction,
} from "../staff-access-actions";
import { PasswordInput } from "./admin-form";

type Mode = "idle" | "create" | "login" | "password";

const unexpected = "Não foi possível falar com o servidor. Verifique a conexão e tente de novo.";

/**
 * Seção "Acesso ao painel" do barbeiro (dentro de Editar). Cada ação grava na hora, sem
 * depender do "Salvar alterações" do cadastro. A senha nunca é mostrada: só dá para definir
 * uma nova.
 */
export default function BarberAccessSection({
  professionalId,
  access,
}: {
  professionalId: string;
  access: BarberAccess | null;
}) {
  const ids = useId();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [, startRefresh] = useTransition();

  const loginError = mode === "create" || mode === "login" ? validateStaffLogin(login) : undefined;
  const passwordError = mode === "create" || mode === "password" ? validateStaffPassword(password) : undefined;
  const status = !access ? "Sem acesso" : access.isActive ? "Ativo" : "Inativo";

  function open(next: Mode) {
    setMode(next);
    setLogin(next === "login" ? (access?.login ?? "") : "");
    setPassword("");
    setAttempted(false);
    setNotice(null);
  }

  async function run(action: () => Promise<SiteActionResult>) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await action();
      setNotice(result);
      if (result.ok) {
        setMode("idle");
        setPassword("");
        // Recarrega os acessos (status e usuário) vindos do servidor.
        startRefresh(() => router.refresh());
      }
    } catch {
      setNotice({ ok: false, message: unexpected });
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    if (busy) return;
    setAttempted(true);
    if (loginError || passwordError) return;
    if (mode === "create") return run(() => createBarberAccessAction(professionalId, login, password));
    if (mode === "login") return run(() => updateBarberLoginAction(professionalId, login));
    if (mode === "password") return run(() => resetBarberPasswordAction(professionalId, password));
  }

  // Enter aqui confirma esta ação, não o formulário do cadastro em volta.
  function onEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submit();
  }

  return (
    <fieldset className="admin-access" aria-describedby={`${ids}-status`}>
      <legend>Acesso ao painel</legend>
      <p className="admin-access__status" id={`${ids}-status`}>
        <span className={`admin-tag ${access?.isActive ? "admin-tag--plan" : "admin-tag--former"}`}>{status}</span>
        {access?.login ? (
          <span>
            Usuário: <strong>{access.login}</strong>
          </span>
        ) : (
          <span>{access ? "Login por e-mail" : "Crie um usuário e uma senha para ele entrar no painel dos barbeiros."}</span>
        )}
      </p>

      {mode === "idle" ? (
        <div className="admin-access__actions">
          {!access ? (
            <button className="admin-text-button admin-row__action" disabled={busy} onClick={() => open("create")} type="button">
              <UserRound aria-hidden="true" size={15} />
              Criar acesso
            </button>
          ) : (
            <>
              <button className="admin-text-button admin-row__action" disabled={busy} onClick={() => open("login")} type="button">
                <UserRound aria-hidden="true" size={15} />
                Alterar usuário
              </button>
              <button
                className="admin-text-button admin-row__action"
                disabled={busy}
                onClick={() => open("password")}
                type="button"
              >
                <KeyRound aria-hidden="true" size={15} />
                Redefinir senha
              </button>
              <button
                aria-busy={busy || undefined}
                className="admin-text-button admin-row__action"
                disabled={busy}
                onClick={() => run(() => setBarberAccessActiveAction(professionalId, !access.isActive))}
                type="button"
              >
                {busy ? (
                  <LoaderCircle aria-hidden="true" className="admin-spinner" size={15} />
                ) : (
                  <Power aria-hidden="true" size={15} />
                )}
                {access.isActive ? "Desativar acesso" : "Reativar acesso"}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="admin-access__form">
          {mode === "create" || mode === "login" ? (
            <div className={`admin-field admin-dialog__field${attempted && loginError ? " has-error" : ""}`}>
              <label htmlFor={`${ids}-login`}>Usuário</label>
              <input
                aria-describedby={`${ids}-login-message`}
                aria-invalid={attempted && loginError ? true : undefined}
                autoCapitalize="none"
                autoComplete="off"
                id={`${ids}-login`}
                maxLength={staffLoginRules.maxLength}
                onChange={(event) => setLogin(event.target.value)}
                onKeyDown={onEnter}
                spellCheck={false}
                type="text"
                value={login}
              />
              <p
                className={attempted && loginError ? "admin-field__error" : "admin-field__hint"}
                id={`${ids}-login-message`}
              >
                {attempted && loginError
                  ? loginError
                  : `Ex.: ${normalizeStaffLogin(login) || "rafael"}. É o que ele digita no login, no lugar do e-mail.`}
              </p>
            </div>
          ) : null}

          {mode === "create" || mode === "password" ? (
            <div className={`admin-field admin-dialog__field${attempted && passwordError ? " has-error" : ""}`}>
              <label htmlFor={`${ids}-password`}>{mode === "create" ? "Senha inicial" : "Nova senha"}</label>
              <PasswordInput
                id={`${ids}-password`}
                invalid={Boolean(attempted && passwordError)}
                maxLength={staffPasswordRules.maxLength}
                onChange={setPassword}
                onKeyDown={onEnter}
                value={password}
              />
              <p
                className={attempted && passwordError ? "admin-field__error" : "admin-field__hint"}
                id={`${ids}-password-message`}
              >
                {attempted && passwordError
                  ? passwordError
                  : `Mínimo de ${staffPasswordRules.minLength} caracteres. Passe ao barbeiro: ela não aparece depois.`}
              </p>
            </div>
          ) : null}

          <div className="admin-access__actions">
            <button className="admin-text-button" disabled={busy} onClick={() => open("idle")} type="button">
              Cancelar
            </button>
            <button
              aria-busy={busy || undefined}
              className="button button--compact admin-action"
              disabled={busy}
              onClick={submit}
              type="button"
            >
              {busy ? <LoaderCircle aria-hidden="true" className="admin-spinner" size={15} /> : null}
              {mode === "create" ? "Criar acesso" : mode === "login" ? "Salvar usuário" : "Salvar nova senha"}
            </button>
          </div>
        </div>
      )}

      {notice ? (
        <p className={notice.ok ? "admin-access__notice" : "admin-access__notice is-error"} role={notice.ok ? "status" : "alert"}>
          {notice.ok ? <CircleCheck aria-hidden="true" size={15} /> : <CircleAlert aria-hidden="true" size={15} />}
          {notice.message}
        </p>
      ) : null}
    </fieldset>
  );
}
