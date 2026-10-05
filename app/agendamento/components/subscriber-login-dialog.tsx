"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarX2,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Snowflake,
  X,
} from "lucide-react";
import Dialog from "../../components/dialog";
import { formatPhone } from "../../data/booking";
import { getPlan } from "../../data/plans";
import { blockedMessages, validateSubscriberPhone, type BlockedReason, type SubscriberSession } from "../../data/subscribers";
import { SubscriberApiError } from "../../lib/subscribers-api";

type DialogIds = { titleId: string; descriptionId: string };

type SubscriberLoginDialogProps = {
  open: boolean;
  /** Muda a cada abertura, para o formulário começar limpo. */
  openKey: number;
  /** Sessão atual. Com o modal aberto, só existe quando o plano está bloqueado. */
  session: SubscriberSession | null;
  onClose: () => void;
  onSignIn: (credentials: { phone: string; password: string }) => Promise<SubscriberSession>;
  /** Segue para o agendamento com a conta (com ou sem benefícios). */
  onContinue: (session: SubscriberSession) => void;
  /** Desiste com o plano bloqueado: sai da conta e fecha. */
  onDecline: () => void;
};

const blockedIcons: Record<BlockedReason, typeof Snowflake> = {
  congelado: Snowflake,
  inativo: CalendarX2,
  pagamento_atrasado: CircleAlert,
};

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button aria-label="Fechar" className="booking-dialog__close" onClick={onClick} type="button">
      <X aria-hidden="true" size={18} />
    </button>
  );
}

function LoginForm({
  ids,
  onClose,
  onSignIn,
  onContinue,
}: {
  ids: DialogIds;
  onClose: () => void;
  onSignIn: SubscriberLoginDialogProps["onSignIn"];
  onContinue: SubscriberLoginDialogProps["onContinue"];
}) {
  const fieldPrefix = useId();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneId = `${fieldPrefix}-phone`;
  const passwordId = `${fieldPrefix}-password`;
  const phoneError = attempted ? validateSubscriberPhone(phone) : undefined;
  const passwordError = attempted && !password ? "Informe a sua senha." : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setError(null);

    if (validateSubscriberPhone(phone) || !password) {
      document.getElementById(validateSubscriberPhone(phone) ? phoneId : passwordId)?.focus();
      return;
    }

    setBusy(true);
    try {
      const session = await onSignIn({ phone, password });
      if (!session.blockedReason) onContinue(session);
    } catch (failure) {
      setError(
        failure instanceof SubscriberApiError
          ? failure.message
          : "Não foi possível entrar agora. Verifique a conexão e tente de novo.",
      );
      setPassword("");
      setBusy(false);
      document.getElementById(passwordId)?.focus();
    }
  }

  return (
    <form className="booking-dialog__panel" noValidate onSubmit={submit}>
      <header className="booking-dialog__header">
        <div>
          <p className="section-heading__eyebrow">Área do assinante</p>
          <h2 id={ids.titleId}>Entre na sua conta</h2>
          <p id={ids.descriptionId}>Use o telefone cadastrado na barbearia e a sua senha.</p>
        </div>
        <CloseButton onClick={onClose} />
      </header>

      <div className="booking-dialog__body">
        {error ? (
          <div className="booking-alert" role="alert">
            <p>
              <CircleAlert aria-hidden="true" size={16} />
              <strong>{error}</strong>
            </p>
          </div>
        ) : null}

        <div className={`booking-field${phoneError ? " has-error" : ""}`}>
          <label htmlFor={phoneId}>Telefone</label>
          <input
            aria-describedby={phoneError ? `${phoneId}-message` : undefined}
            aria-invalid={phoneError ? true : undefined}
            autoComplete="username"
            className="booking-input"
            enterKeyHint="next"
            id={phoneId}
            inputMode="tel"
            name="phone"
            onChange={(event) => setPhone(formatPhone(event.target.value))}
            placeholder="(31) 99999-9999"
            type="tel"
            value={phone}
          />
          {phoneError ? (
            <p className="booking-field__error" id={`${phoneId}-message`}>
              <CircleAlert aria-hidden="true" size={14} />
              {phoneError}
            </p>
          ) : null}
        </div>

        <div className={`booking-field${passwordError ? " has-error" : ""}`}>
          <label htmlFor={passwordId}>Senha</label>
          <span className="booking-password">
            <input
              aria-describedby={passwordError ? `${passwordId}-message` : undefined}
              aria-invalid={passwordError ? true : undefined}
              autoCapitalize="none"
              autoComplete="current-password"
              className="booking-input"
              enterKeyHint="go"
              id={passwordId}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              spellCheck={false}
              type={showPassword ? "text" : "password"}
              value={password}
            />
            <button
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={showPassword}
              className="booking-password__toggle"
              onClick={() => setShowPassword((current) => !current)}
              type="button"
            >
              {showPassword ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
            </button>
          </span>
          {passwordError ? (
            <p className="booking-field__error" id={`${passwordId}-message`}>
              <CircleAlert aria-hidden="true" size={14} />
              {passwordError}
            </p>
          ) : null}
        </div>

        <p className="booking-form__privacy">
          <LockKeyhole aria-hidden="true" size={15} strokeWidth={1.7} />
          Esqueceu a senha? Peça para a barbearia redefinir no balcão ou pelo WhatsApp.
        </p>
      </div>

      <footer className="booking-dialog__footer">
        <button className="booking-back" onClick={onClose} type="button">
          <ArrowLeft aria-hidden="true" size={16} />
          Voltar
        </button>
        <button aria-busy={busy || undefined} className="button booking-primary" disabled={busy} type="submit">
          {busy ? (
            <>
              <LoaderCircle aria-hidden="true" className="booking-spinner" size={17} />
              Entrando…
            </>
          ) : (
            <>
              Entrar
              <ArrowRight aria-hidden="true" size={17} strokeWidth={1.8} />
            </>
          )}
        </button>
      </footer>
    </form>
  );
}

function BlockedNotice({
  ids,
  session,
  reason,
  onContinue,
  onDecline,
}: {
  ids: DialogIds;
  session: SubscriberSession;
  reason: BlockedReason;
  onContinue: SubscriberLoginDialogProps["onContinue"];
  onDecline: () => void;
}) {
  const Icon = blockedIcons[reason];
  const message = blockedMessages[reason];
  const continueRef = useRef<HTMLButtonElement>(null);

  // O formulário some ao trocar para este aviso: o foco vai para a ação principal.
  useEffect(() => {
    continueRef.current?.focus();
  }, []);

  return (
    <div className="booking-dialog__panel">
      <header className="booking-dialog__header">
        <div>
          <p className="section-heading__eyebrow">Área do assinante</p>
          <h2 id={ids.titleId}>{message.title}</h2>
          <p id={ids.descriptionId}>{message.description}</p>
        </div>
        <CloseButton onClick={onDecline} />
      </header>

      <div className="booking-dialog__body">
        <div className="booking-dialog__account">
          <span className="booking-empty__icon">
            <Icon aria-hidden="true" size={20} strokeWidth={1.6} />
          </span>
          <span>
            <strong>{session.name}</strong>
            <small>
              {getPlan(session.planId)?.name} · {session.phone}
            </small>
          </span>
        </div>
      </div>

      <footer className="booking-dialog__footer">
        <button className="booking-back" onClick={onDecline} type="button">
          <ArrowLeft aria-hidden="true" size={16} />
          Voltar
        </button>
        <button className="button booking-primary" onClick={() => onContinue(session)} ref={continueRef} type="button">
          Agendar sem os benefícios
          <ArrowRight aria-hidden="true" size={17} strokeWidth={1.8} />
        </button>
      </footer>
    </div>
  );
}

export default function SubscriberLoginDialog({
  open,
  openKey,
  session,
  onClose,
  onSignIn,
  onContinue,
  onDecline,
}: SubscriberLoginDialogProps) {
  const id = useId();
  const ids = { titleId: `${id}-title`, descriptionId: `${id}-description` };
  const blockedReason = session?.blockedReason ?? null;

  return (
    <Dialog
      className="booking-dialog"
      describedBy={ids.descriptionId}
      labelledBy={ids.titleId}
      onClose={session ? onDecline : onClose}
      open={open}
    >
      {session && blockedReason ? (
        <BlockedNotice ids={ids} onContinue={onContinue} onDecline={onDecline} reason={blockedReason} session={session} />
      ) : (
        <LoginForm ids={ids} key={openKey} onClose={onClose} onContinue={onContinue} onSignIn={onSignIn} />
      )}
    </Dialog>
  );
}
