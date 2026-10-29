"use client";

import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, PenLine } from "lucide-react";
import Dialog from "../../components/dialog";
import { formatPhone } from "../../data/booking";
import {
  shopDetailsLimits,
  validateShopDetails,
  type ShopDetails,
  type ShopDetailsErrors,
  type ShopDetailsInput,
} from "../../data/shop";
import { saveShopDetailsAction, type SiteActionResult } from "../site-actions";
import { DialogFrame, Field, FormAlert, SubmitButton, useDialogIds, type DialogIds } from "./admin-form";

type Notice = { tone: "success" | "error"; message: string } | null;

const unexpected = "Não foi possível falar com o servidor. Verifique a conexão e tente de novo.";

const fieldOrder = ["name", "description", "address", "city", "phone", "whatsapp", "instagram", "mapsUrl"] as const;

function toInput(details: ShopDetails): ShopDetailsInput {
  return {
    name: details.name,
    description: details.description ?? "",
    address: details.address ?? "",
    city: details.city ?? "",
    phone: details.phone ?? "",
    whatsapp: details.whatsapp ?? "",
    instagram: details.instagram ?? "",
    mapsUrl: details.mapsUrl ?? "",
  };
}

/**
 * Edição do site > Barbearia: nome, descrição, endereço e contatos que aparecem no topo,
 * na localização e no rodapé do site. Fuso e regras do agendamento não mudam por aqui.
 */
export default function SiteShop({ details }: { details: ShopDetails }) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [refreshing, startRefresh] = useTransition();
  const [open, setOpen] = useState(false);
  const [openKey, setOpenKey] = useState(0);
  const empty = <span className="admin-shop__empty">Não informado</span>;

  const rows: { label: string; value: ReactNode }[] = [
    { label: "Nome", value: details.name },
    { label: "Descrição", value: details.description || <span className="admin-shop__empty">Texto padrão do site</span> },
    { label: "Endereço", value: details.address || empty },
    { label: "Cidade", value: details.city || empty },
    { label: "Telefone", value: details.phone || empty },
    { label: "WhatsApp", value: details.whatsapp || empty },
    { label: "Instagram", value: details.instagram || empty },
    {
      label: "Link do mapa",
      value: details.mapsUrl ? (
        <a className="admin-link" href={details.mapsUrl} rel="noreferrer" target="_blank">
          Abrir no Google Maps
        </a>
      ) : (
        <span className="admin-shop__empty">Busca pelo endereço</span>
      ),
    },
  ];

  return (
    <section aria-labelledby="barbearia-title" className="admin-panel admin-site">
      <div className="admin-panel__heading admin-panel__heading--split">
        <div>
          <h2 id="barbearia-title">Dados da barbearia</h2>
          <p>Nome, endereço e contatos que aparecem no site.</p>
        </div>
        <button
          className="button button--compact admin-action"
          disabled={refreshing}
          onClick={() => {
            setOpenKey((key) => key + 1);
            setOpen(true);
          }}
          type="button"
        >
          <PenLine aria-hidden="true" size={15} />
          Editar dados
        </button>
      </div>

      {notice ? (
        <div
          className={`admin-alert${notice.tone === "success" ? " admin-alert--success" : ""}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.tone === "success" ? (
            <CircleCheck aria-hidden="true" size={16} />
          ) : (
            <CircleAlert aria-hidden="true" size={16} />
          )}
          <span>{notice.message}</span>
          <button className="admin-text-button" onClick={() => setNotice(null)} type="button">
            Fechar
          </button>
        </div>
      ) : null}

      <dl aria-busy={refreshing || undefined} className="admin-shop">
        {rows.map((row) => (
          <div className="admin-shop__row" key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>

      <ShopDetailsDialog
        details={details}
        onClose={() => setOpen(false)}
        onSaved={(result) => {
          setOpen(false);
          setNotice({ tone: "success", message: result.message });
          startRefresh(() => router.refresh());
        }}
        open={open}
        openKey={openKey}
      />
    </section>
  );
}

function ShopDetailsForm({
  details,
  dialogIds,
  onClose,
  onSaved,
}: {
  details: ShopDetails;
  dialogIds: DialogIds;
  onClose: () => void;
  onSaved: (result: SiteActionResult) => void;
}) {
  const ids = useId();
  const [values, setValues] = useState<ShopDetailsInput>(() => toInput(details));
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fieldId = (field: string) => `${ids}-${field}`;
  const errors: ShopDetailsErrors = attempted ? validateShopDetails(values) : {};

  function set(field: keyof ShopDetailsInput, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    setFormError(null);

    const problems = validateShopDetails(values);
    const first = fieldOrder.find((field) => problems[field]);
    if (first) {
      document.getElementById(fieldId(first))?.focus();
      return;
    }

    setBusy(true);
    try {
      const result = await saveShopDetailsAction(values);
      if (!result.ok) {
        setFormError(result.message);
        setBusy(false);
        return;
      }
      onSaved(result);
    } catch {
      setFormError(unexpected);
      setBusy(false);
    }
  }

  function input(
    field: keyof ShopDetailsInput,
    options: { maxLength?: number; inputMode?: "tel" | "url"; placeholder?: string; autoComplete?: string } = {},
  ) {
    return (
      <input
        aria-describedby={`${fieldId(field)}-message`}
        aria-invalid={errors[field] ? true : undefined}
        autoComplete={options.autoComplete ?? "off"}
        id={fieldId(field)}
        inputMode={options.inputMode}
        maxLength={options.maxLength}
        onChange={(event) =>
          set(field, options.inputMode === "tel" ? formatPhone(event.target.value) : event.target.value)
        }
        placeholder={options.placeholder}
        type={options.inputMode === "url" ? "url" : options.inputMode === "tel" ? "tel" : "text"}
        value={values[field]}
      />
    );
  }

  return (
    <DialogFrame
      description="As mudanças aparecem no site assim que você salvar."
      descriptionId={dialogIds.descriptionId}
      footer={
        <>
          <button className="admin-text-button" disabled={busy} onClick={onClose} type="button">
            Cancelar
          </button>
          <SubmitButton busy={busy} busyLabel="Salvando…" label="Salvar dados" />
        </>
      }
      onClose={onClose}
      onSubmit={submit}
      title="Dados da barbearia"
      titleId={dialogIds.titleId}
    >
      <Field error={errors.name} hint="Aparece no logotipo, no título da página e no rodapé." id={fieldId("name")} label="Nome">
        {input("name", { maxLength: shopDetailsLimits.name })}
      </Field>

      <Field
        error={errors.description}
        hint="Resumo usado no Google e ao compartilhar o link. Em branco, o site usa um texto padrão."
        id={fieldId("description")}
        label="Descrição"
      >
        <textarea
          aria-describedby={`${fieldId("description")}-message`}
          aria-invalid={errors.description ? true : undefined}
          id={fieldId("description")}
          maxLength={shopDetailsLimits.description}
          onChange={(event) => set("description", event.target.value)}
          rows={3}
          value={values.description}
        />
      </Field>

      <div className="admin-form-row">
        <Field error={errors.address} id={fieldId("address")} label="Endereço">
          {input("address", { maxLength: shopDetailsLimits.address, placeholder: "Rua, número" })}
        </Field>
        <Field error={errors.city} id={fieldId("city")} label="Cidade">
          {input("city", { maxLength: shopDetailsLimits.city, placeholder: "Cidade - UF" })}
        </Field>
      </div>

      <div className="admin-form-row">
        <Field error={errors.phone} id={fieldId("phone")} label="Telefone">
          {input("phone", { inputMode: "tel", maxLength: 15, placeholder: "(31) 3333-3333" })}
        </Field>
        <Field error={errors.whatsapp} hint="Usado no botão de WhatsApp do site." id={fieldId("whatsapp")} label="WhatsApp">
          {input("whatsapp", { inputMode: "tel", maxLength: 15, placeholder: "(31) 99999-9999" })}
        </Field>
      </div>

      <Field error={errors.instagram} id={fieldId("instagram")} label="Instagram">
        {input("instagram", { maxLength: 60, placeholder: "@barbearia" })}
      </Field>

      <Field
        error={errors.mapsUrl}
        hint="No Google Maps, abra a barbearia, toque em Compartilhar e cole o link. Em branco, o site busca pelo endereço."
        id={fieldId("mapsUrl")}
        label="Link do Google Maps"
      >
        {input("mapsUrl", { inputMode: "url", maxLength: shopDetailsLimits.mapsUrl, placeholder: "https://maps.app.goo.gl/…" })}
      </Field>

      <FormAlert message={formError} />
    </DialogFrame>
  );
}

function ShopDetailsDialog({
  open,
  openKey,
  details,
  onClose,
  onSaved,
}: {
  open: boolean;
  openKey: number;
  details: ShopDetails;
  onClose: () => void;
  onSaved: (result: SiteActionResult) => void;
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
      <ShopDetailsForm dialogIds={dialogIds} details={details} key={openKey} onClose={onClose} onSaved={onSaved} />
    </Dialog>
  );
}
