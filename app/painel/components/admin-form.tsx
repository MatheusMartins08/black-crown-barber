"use client";

import { useId, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { CircleAlert, Eye, EyeOff, LoaderCircle, X } from "lucide-react";

// Peças dos formulários em diálogo do painel (assinantes, edição do site).

export type DialogIds = { titleId: string; descriptionId: string };

export function useDialogIds(): DialogIds {
  const id = useId();
  return { titleId: `${id}-title`, descriptionId: `${id}-description` };
}

export function DialogFrame({
  titleId,
  descriptionId,
  title,
  description,
  onClose,
  onSubmit,
  footer,
  children,
}: {
  titleId: string;
  descriptionId: string;
  title: string;
  description: ReactNode;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <form className="admin-dialog__panel" noValidate onSubmit={onSubmit}>
      <header className="admin-dialog__header">
        <div>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
        </div>
        <button aria-label="Fechar" className="admin-icon-button" onClick={onClose} type="button">
          <X aria-hidden="true" size={18} />
        </button>
      </header>
      <div className="admin-dialog__body">{children}</div>
      <footer className="admin-dialog__footer">{footer}</footer>
    </form>
  );
}

export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={`admin-field admin-dialog__field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <p className="admin-field__error" id={`${id}-message`}>
          <CircleAlert aria-hidden="true" size={13} />
          {error}
        </p>
      ) : hint ? (
        <p className="admin-field__hint" id={`${id}-message`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({ busy, label, busyLabel }: { busy: boolean; label: string; busyLabel: string }) {
  return (
    <button aria-busy={busy || undefined} className="button button--compact admin-action" disabled={busy} type="submit">
      {busy ? <LoaderCircle aria-hidden="true" className="admin-spinner" size={15} /> : null}
      {busy ? busyLabel : label}
    </button>
  );
}

export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="admin-dialog__alert" role="alert">
      <CircleAlert aria-hidden="true" size={15} />
      {message}
    </p>
  );
}

/** Senha nova (cadastro ou redefinição) com o botão de mostrar/ocultar. Nunca é preenchida com a atual. */
export function PasswordInput({
  id,
  value,
  invalid,
  maxLength,
  onChange,
  onBlur,
  onKeyDown,
}: {
  id: string;
  value: string;
  invalid: boolean;
  maxLength: number;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="admin-password">
      <input
        aria-describedby={`${id}-message`}
        aria-invalid={invalid || undefined}
        autoCapitalize="none"
        autoComplete="new-password"
        id={id}
        maxLength={maxLength}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        type={visible ? "text" : "password"}
        value={value}
      />
      <button
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
        className="admin-password__toggle"
        onClick={() => setVisible((current) => !current)}
        type="button"
      >
        {visible ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}
      </button>
    </span>
  );
}
