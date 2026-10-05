"use client";

import { useState, type ReactNode } from "react";
import { CircleAlert, LockKeyhole } from "lucide-react";
import {
  customerLimits,
  formatPhone,
  validateCustomer,
  type CustomerDetails,
  type CustomerTextField,
} from "../../../data/booking";

type FieldName = CustomerTextField;

type DetailsStepProps = {
  customer: CustomerDetails;
  /** Mostra todos os erros (depois de uma tentativa de avançar). */
  showAllErrors: boolean;
  onChange: (changes: Partial<CustomerDetails>) => void;
  onSubmit: () => void;
};

export function getFieldId(field: FieldName) {
  return `booking-${field}`;
}

function Field({
  field,
  label,
  optional = false,
  error,
  hint,
  wide = false,
  children,
}: {
  field: FieldName;
  label: string;
  optional?: boolean;
  error?: string;
  hint?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  const id = getFieldId(field);

  return (
    <div className={`booking-field${wide ? " booking-field--wide" : ""}${error ? " has-error" : ""}`}>
      <label htmlFor={id}>
        {label}
        {optional ? <span className="booking-field__optional">opcional</span> : null}
      </label>
      {children}
      {error ? (
        <p className="booking-field__error" id={`${id}-message`}>
          <CircleAlert aria-hidden="true" size={14} />
          {error}
        </p>
      ) : hint ? (
        <p className="booking-field__hint" id={`${id}-message`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export default function DetailsStep({ customer, showAllErrors, onChange, onSubmit }: DetailsStepProps) {
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const errors = validateCustomer(customer);

  function visibleError(field: FieldName) {
    return showAllErrors || touched[field] ? errors[field] : undefined;
  }

  function inputProps(field: FieldName) {
    const error = visibleError(field);
    return {
      id: getFieldId(field),
      name: field,
      className: "booking-input",
      value: customer[field],
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error || field === "notes" || field === "phone" ? `${getFieldId(field)}-message` : undefined,
      onBlur: () => setTouched((current) => ({ ...current, [field]: true })),
    };
  }

  return (
    <form
      className="booking-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Field error={visibleError("name")} field="name" label="Nome">
        <input
          {...inputProps("name")}
          autoComplete="name"
          enterKeyHint="next"
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="Como devemos te chamar?"
          type="text"
        />
      </Field>

      <Field error={visibleError("phone")} field="phone" hint="Usado para confirmar o horário." label="Telefone / WhatsApp">
        <input
          {...inputProps("phone")}
          autoComplete="tel-national"
          enterKeyHint="next"
          inputMode="tel"
          onChange={(event) => onChange({ phone: formatPhone(event.target.value) })}
          placeholder="(31) 99999-9999"
          type="tel"
        />
      </Field>

      <Field error={visibleError("email")} field="email" label="E-mail" optional wide>
        <input
          {...inputProps("email")}
          autoCapitalize="none"
          autoComplete="email"
          enterKeyHint="next"
          onChange={(event) => onChange({ email: event.target.value })}
          placeholder="voce@email.com"
          spellCheck={false}
          type="email"
        />
      </Field>

      <Field
        error={visibleError("notes")}
        field="notes"
        hint={
          <>
            <span>Referências de corte, preferências ou algo que o barbeiro deva saber.</span>
            <span className="booking-field__counter">
              {customer.notes.length}/{customerLimits.notesMaxLength}
            </span>
          </>
        }
        label="Observações para o barbeiro"
        optional
        wide
      >
        <textarea
          {...inputProps("notes")}
          maxLength={customerLimits.notesMaxLength}
          onChange={(event) => onChange({ notes: event.target.value })}
          placeholder="Ex.: quero manter o comprimento em cima."
          rows={3}
        />
      </Field>

      {/* Consentimento da LGPD para mensagens: opcional e desmarcado por padrão. */}
      <label className="booking-consent" htmlFor="booking-whatsappOptIn">
        <input
          checked={customer.whatsappOptIn}
          id="booking-whatsappOptIn"
          name="whatsappOptIn"
          onChange={(event) => onChange({ whatsappOptIn: event.target.checked })}
          type="checkbox"
        />
        <span>Aceito receber a confirmação e lembretes do horário pelo WhatsApp.</span>
      </label>

      <p className="booking-form__privacy">
        <LockKeyhole aria-hidden="true" size={15} strokeWidth={1.7} />
        Seus dados são usados apenas para este agendamento.
      </p>

      {/* Permite enviar com Enter a partir de qualquer campo. */}
      <button className="sr-only" tabIndex={-1} type="submit">
        Revisar agendamento
      </button>
    </form>
  );
}
