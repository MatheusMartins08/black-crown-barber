"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { CircleAlert, Eye, EyeOff, LoaderCircle, X } from "lucide-react";
import Dialog from "../../components/dialog";
import { formatPhone } from "../../data/booking";
import { describePlanBenefits, subscriptionPlans, type PlanId } from "../../data/plans";
import {
  hasSubscriberErrors,
  passwordRules,
  subscriptionStatusLabels,
  subscriptionStatuses,
  validateSubscriberName,
  validateSubscriberPassword,
  validateSubscriberPhone,
  type SubscriberAccount,
  type SubscriberErrors,
  type SubscriptionStatus,
} from "../../data/subscribers";
import {
  createSubscriber,
  resetSubscriberPassword,
  SubscriberApiError,
  updateSubscriber,
} from "../../lib/subscribers-api";

const statusDescriptions: Record<SubscriptionStatus, string> = {
  ativo: "Benefícios do plano liberados no agendamento online.",
  congelado: "O cliente entra no site, mas os benefícios ficam pausados até reativar.",
  inativo: "Assinatura encerrada. O cliente agenda pagando o valor avulso.",
};

function DialogFrame({
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

function Field({
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

function PasswordInput({
  id,
  value,
  invalid,
  onChange,
  onBlur,
}: {
  id: string;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
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
        maxLength={passwordRules.maxLength}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
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

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div aria-label={label} className="admin-segmented admin-dialog__segmented" role="radiogroup">
      {options.map((option) => (
        <button
          aria-checked={value === option.value}
          className={value === option.value ? "is-active" : undefined}
          key={option.value}
          onClick={() => onChange(option.value)}
          role="radio"
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SubmitButton({ busy, label, busyLabel }: { busy: boolean; label: string; busyLabel: string }) {
  return (
    <button aria-busy={busy || undefined} className="button button--compact admin-action" disabled={busy} type="submit">
      {busy ? <LoaderCircle aria-hidden="true" className="admin-spinner" size={15} /> : null}
      {busy ? busyLabel : label}
    </button>
  );
}

function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="admin-dialog__alert" role="alert">
      <CircleAlert aria-hidden="true" size={15} />
      {message}
    </p>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof SubscriberApiError ? error.message : "Não foi possível salvar agora. Tente novamente.";
}

// --- Novo assinante / editar dados ---

type FormMode = { type: "create" } | { type: "edit"; account: SubscriberAccount };

type DialogIds = { titleId: string; descriptionId: string };

function SubscriberForm({
  mode,
  dialogIds,
  onClose,
  onSaved,
}: {
  mode: FormMode;
  dialogIds: DialogIds;
  onClose: () => void;
  onSaved: (account: SubscriberAccount, isNew: boolean) => void;
}) {
  const ids = useId();
  const isCreate = mode.type === "create";
  const [name, setName] = useState(isCreate ? "" : mode.account.name);
  const [phone, setPhone] = useState(isCreate ? "" : mode.account.phone);
  const [password, setPassword] = useState("");
  const [planId, setPlanId] = useState<PlanId>(isCreate ? "bronze" : mode.account.planId);
  const [status, setStatus] = useState<SubscriptionStatus>(isCreate ? "ativo" : mode.account.status);
  const [touched, setTouched] = useState<Partial<Record<keyof SubscriberErrors, boolean>>>({});
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const errors: SubscriberErrors = {
    name: validateSubscriberName(name),
    phone: validateSubscriberPhone(phone) ?? phoneError ?? undefined,
    password: isCreate ? validateSubscriberPassword(password) : undefined,
  };
  const visible = (field: keyof SubscriberErrors) => (attempted || touched[field] ? errors[field] : undefined);
  const touch = (field: keyof SubscriberErrors) => setTouched((current) => ({ ...current, [field]: true }));
  const fieldId = (field: string) => `${ids}-${field}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setFormError(null);

    if (hasSubscriberErrors(errors)) {
      const first = (["name", "phone", "password"] as const).find((field) => errors[field]);
      if (first) document.getElementById(fieldId(first))?.focus();
      return;
    }

    setBusy(true);
    try {
      const saved = isCreate
        ? await createSubscriber({ name, phone, password, planId, status })
        : await updateSubscriber(mode.account.id, { name, phone });
      onSaved(saved, isCreate);
    } catch (error) {
      if (error instanceof SubscriberApiError && error.reason === "phone_in_use") {
        setPhoneError(error.message);
        document.getElementById(fieldId("phone"))?.focus();
      } else {
        setFormError(getErrorMessage(error));
      }
      setBusy(false);
    }
  }

  return (
    <DialogFrame
      description={
        isCreate
          ? "Cadastre depois que o cliente contratar e pagar o plano na barbearia."
          : "Plano e status mudam direto na lista de assinantes."
      }
      descriptionId={dialogIds.descriptionId}
      footer={
        <>
          <button className="admin-text-button" onClick={onClose} type="button">
            Cancelar
          </button>
          <SubmitButton
            busy={busy}
            busyLabel={isCreate ? "Cadastrando…" : "Salvando…"}
            label={isCreate ? "Cadastrar assinante" : "Salvar alterações"}
          />
        </>
      }
      onClose={onClose}
      onSubmit={submit}
      title={isCreate ? "Novo assinante" : "Editar assinante"}
      titleId={dialogIds.titleId}
    >
      <Field error={visible("name")} id={fieldId("name")} label="Nome do cliente">
        <input
          aria-describedby={visible("name") ? `${fieldId("name")}-message` : undefined}
          aria-invalid={visible("name") ? true : undefined}
          autoComplete="off"
          id={fieldId("name")}
          maxLength={120}
          onBlur={() => touch("name")}
          onChange={(event) => setName(event.target.value)}
          type="text"
          value={name}
        />
      </Field>

      <Field
        error={visible("phone")}
        hint="É o login do cliente no site."
        id={fieldId("phone")}
        label="Telefone (login)"
      >
        <input
          aria-describedby={`${fieldId("phone")}-message`}
          aria-invalid={visible("phone") ? true : undefined}
          autoComplete="off"
          id={fieldId("phone")}
          inputMode="tel"
          onBlur={() => touch("phone")}
          onChange={(event) => {
            setPhone(formatPhone(event.target.value));
            setPhoneError(null);
          }}
          placeholder="(31) 99999-9999"
          type="tel"
          value={phone}
        />
      </Field>

      {isCreate ? (
        <>
          <Field
            error={visible("password")}
            hint={`Mínimo de ${passwordRules.minLength} caracteres. Passe ao cliente: ela não aparece depois do cadastro.`}
            id={fieldId("password")}
            label="Senha inicial"
          >
            <PasswordInput
              id={fieldId("password")}
              invalid={Boolean(visible("password"))}
              onBlur={() => touch("password")}
              onChange={setPassword}
              value={password}
            />
          </Field>

          <div className="admin-field admin-dialog__field">
            <span>Plano</span>
            <Segmented
              label="Plano"
              onChange={setPlanId}
              options={subscriptionPlans.map((plan) => ({ value: plan.id, label: plan.shortName }))}
              value={planId}
            />
            <p className="admin-field__hint">{describePlanBenefits(planId)}</p>
          </div>

          <div className="admin-field admin-dialog__field">
            <span>Status</span>
            <Segmented
              label="Status"
              onChange={setStatus}
              options={subscriptionStatuses.map((value) => ({ value, label: subscriptionStatusLabels[value] }))}
              value={status}
            />
            <p className="admin-field__hint">{statusDescriptions[status]}</p>
          </div>
        </>
      ) : null}

      <FormAlert message={formError} />
    </DialogFrame>
  );
}

function useDialogIds(): DialogIds {
  const id = useId();
  return { titleId: `${id}-title`, descriptionId: `${id}-description` };
}

export function SubscriberFormDialog({
  open,
  mode,
  openKey,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: FormMode;
  /** Muda a cada abertura, para o formulário começar limpo. */
  openKey: number;
  onClose: () => void;
  onSaved: (account: SubscriberAccount, isNew: boolean) => void;
}) {
  const dialogIds = useDialogIds();

  return (
    <Dialog
      className="admin-dialog"
      describedBy={dialogIds.descriptionId}
      labelledBy={dialogIds.titleId}
      onClose={onClose}
      open={open}
    >
      <SubscriberForm dialogIds={dialogIds} key={openKey} mode={mode} onClose={onClose} onSaved={onSaved} />
    </Dialog>
  );
}

// --- Redefinir senha ---

function ResetPasswordForm({
  account,
  dialogIds,
  onClose,
  onDone,
}: {
  account: SubscriberAccount;
  dialogIds: DialogIds;
  onClose: () => void;
  onDone: () => void;
}) {
  const ids = useId();
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const error = validateSubscriberPassword(password);
  const visibleError = attempted || touched ? error : undefined;
  const fieldId = `${ids}-password`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setFormError(null);
    if (error) {
      document.getElementById(fieldId)?.focus();
      return;
    }

    setBusy(true);
    try {
      await resetSubscriberPassword(account.id, password);
      onDone();
    } catch (failure) {
      setFormError(getErrorMessage(failure));
      setBusy(false);
    }
  }

  return (
    <DialogFrame
      description={
        <>
          {account.name} · {account.phone}. A senha anterior deixa de funcionar assim que a nova for salva.
        </>
      }
      descriptionId={dialogIds.descriptionId}
      footer={
        <>
          <button className="admin-text-button" onClick={onClose} type="button">
            Cancelar
          </button>
          <SubmitButton busy={busy} busyLabel="Salvando…" label="Redefinir senha" />
        </>
      }
      onClose={onClose}
      onSubmit={submit}
      title="Redefinir senha"
      titleId={dialogIds.titleId}
    >
      <Field
        error={visibleError}
        hint={`Mínimo de ${passwordRules.minLength} caracteres. Passe a nova senha ao cliente.`}
        id={fieldId}
        label="Nova senha"
      >
        <PasswordInput
          id={fieldId}
          invalid={Boolean(visibleError)}
          onBlur={() => setTouched(true)}
          onChange={setPassword}
          value={password}
        />
      </Field>
      <FormAlert message={formError} />
    </DialogFrame>
  );
}

export function ResetPasswordDialog({
  open,
  account,
  openKey,
  onClose,
  onDone,
}: {
  open: boolean;
  account: SubscriberAccount | null;
  openKey: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const dialogIds = useDialogIds();

  return (
    <Dialog
      className="admin-dialog"
      describedBy={dialogIds.descriptionId}
      labelledBy={dialogIds.titleId}
      onClose={onClose}
      open={open}
    >
      {account ? (
        <ResetPasswordForm account={account} dialogIds={dialogIds} key={openKey} onClose={onClose} onDone={onDone} />
      ) : null}
    </Dialog>
  );
}
