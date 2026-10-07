"use client";

import { useId, useRef, useState, useTransition, type FormEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, CircleAlert, CircleCheck, Eye, EyeOff, Pencil, Plus, Scissors, Trash2 } from "lucide-react";
import Dialog from "../../components/dialog";
import { DefaultServiceIcon, serviceIconKeys, serviceIconOptions, serviceIcons } from "../../components/service-icons";
import { formatCurrency } from "../../data/booking";
import {
  formatDuration,
  formatMoneyInput,
  parseMoney,
  serviceLimits,
  validateService,
  type Service,
  type ServiceErrors,
} from "../../data/services";
import type { ServiceUsage } from "../lib/staff";
import {
  deleteServiceAction,
  moveServiceAction,
  saveServiceAction,
  setServiceActiveAction,
  type SiteActionResult,
} from "../site-actions";
import { DialogFrame, Field, FormAlert, SubmitButton, useDialogIds, type DialogIds } from "./admin-form";
import { usePainelServices } from "./painel-catalog";

type Notice = { tone: "success" | "error"; message: string } | null;
type FormMode = { type: "create" } | { type: "edit"; service: Service };
type Confirm = { type: "deactivate" | "delete"; service: Service } | null;

const unexpected = "Não foi possível falar com o servidor. Verifique a conexão e tente de novo.";

function formatPlans(plans: string[]) {
  return plans.length > 1 ? `${plans.slice(0, -1).join(", ")} e ${plans.at(-1)}` : (plans[0] ?? "");
}

/**
 * Edição do site > Serviços: o menu da barbearia na landing, no agendamento e no painel.
 * Preço e duração mudam só para novos agendamentos (cada atendimento guarda os seus).
 */
export default function SiteServices({ usage }: { usage: Record<string, ServiceUsage> }) {
  const router = useRouter();
  // Excluídos ficam só no histórico (agenda e fechamento): não aparecem aqui.
  const services = usePainelServices().filter((service) => service.deletedAt === null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>({ type: "create" });
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [openKey, setOpenKey] = useState(0);

  const activeCount = services.filter((service) => service.isActive).length;
  const locked = busyId !== null || refreshing;

  function finish(result: SiteActionResult) {
    if (result.message) setNotice({ tone: result.ok ? "success" : "error", message: result.message });
    if (result.ok) startRefresh(() => router.refresh());
  }

  async function run(id: string, action: () => Promise<SiteActionResult>) {
    if (locked) return;
    setBusyId(id);
    setNotice(null);
    try {
      finish(await action());
    } catch {
      setNotice({ tone: "error", message: unexpected });
    } finally {
      setBusyId(null);
    }
  }

  function openForm(mode: FormMode) {
    setFormMode(mode);
    setOpenKey((key) => key + 1);
    setFormOpen(true);
  }

  function askConfirm(next: NonNullable<Confirm>) {
    setConfirm(next);
    setOpenKey((key) => key + 1);
    setConfirmOpen(true);
  }

  return (
    <section aria-labelledby="servicos-title" className="admin-panel admin-site">
      <div className="admin-panel__heading admin-panel__heading--split">
        <div>
          <h2 id="servicos-title">Serviços</h2>
          <p>
            {activeCount} de {services.length} no site e no agendamento. A ordem da lista é a do site.
          </p>
        </div>
        <button
          className="button button--compact admin-action"
          disabled={locked}
          onClick={() => openForm({ type: "create" })}
          type="button"
        >
          <Plus aria-hidden="true" size={15} />
          Adicionar serviço
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

      {services.length === 0 ? (
        <div className="admin-empty">
          <Scissors aria-hidden="true" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">Nenhum serviço cadastrado</p>
          <p>Adicione o primeiro serviço para ele aparecer no site e no agendamento.</p>
        </div>
      ) : (
        <ol aria-busy={refreshing || undefined} className="admin-site-list">
          {services.map((service, index) => {
            const Icon = serviceIcons[service.icon] ?? DefaultServiceIcon;
            const busy = busyId === service.id;
            const plans = usage[service.id]?.plans ?? [];
            return (
              <li className={`admin-site-item${service.isActive ? "" : " is-inactive"}`} key={service.id}>
                <span className="admin-site-item__media admin-site-item__media--icon">
                  <Icon aria-hidden="true" size={20} strokeWidth={1.6} />
                </span>
                <div className="admin-site-item__body">
                  <p className="admin-site-item__title">
                    {service.name}
                    <span className={`admin-tag ${service.isActive ? "admin-tag--plan" : "admin-tag--former"}`}>
                      {service.isActive ? "Ativo" : "Inativo"}
                    </span>
                    {service.isPopular ? <span className="admin-tag admin-tag--walkin">Mais pedido</span> : null}
                  </p>
                  <p className="admin-site-item__meta">
                    {formatDuration(service.durationMinutes)} · {formatCurrency(service.price)}
                    {plans.length ? ` · nos planos: ${formatPlans(plans)}` : ""}
                  </p>
                </div>
                <div className="admin-site-item__actions">
                  <span className="admin-site-item__order">
                    <button
                      aria-label={`Subir ${service.name} na ordem`}
                      className="admin-icon-button"
                      disabled={locked || index === 0}
                      onClick={() => run(service.id, () => moveServiceAction(service.id, -1))}
                      title="Subir"
                      type="button"
                    >
                      <ArrowUp aria-hidden="true" size={16} />
                    </button>
                    <button
                      aria-label={`Descer ${service.name} na ordem`}
                      className="admin-icon-button"
                      disabled={locked || index === services.length - 1}
                      onClick={() => run(service.id, () => moveServiceAction(service.id, 1))}
                      title="Descer"
                      type="button"
                    >
                      <ArrowDown aria-hidden="true" size={16} />
                    </button>
                  </span>
                  <button
                    className="admin-text-button admin-row__action"
                    disabled={locked}
                    onClick={() => openForm({ type: "edit", service })}
                    type="button"
                  >
                    <Pencil aria-hidden="true" size={15} />
                    Editar
                    <span className="sr-only"> {service.name}</span>
                  </button>
                  <button
                    aria-busy={busy || undefined}
                    className="admin-text-button admin-row__action"
                    disabled={locked}
                    onClick={() =>
                      service.isActive
                        ? askConfirm({ type: "deactivate", service })
                        : run(service.id, () => setServiceActiveAction(service.id, true))
                    }
                    type="button"
                  >
                    {service.isActive ? <EyeOff aria-hidden="true" size={15} /> : <Eye aria-hidden="true" size={15} />}
                    {service.isActive ? "Inativar" : "Ativar"}
                    <span className="sr-only"> {service.name}</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <details className="admin-help">
        <summary>Como funciona</summary>
        <p>
          Nome, descrição, duração, preço e ícone aparecem no site e no agendamento. Mudanças valem para novos agendamentos:
          cada atendimento já marcado ou concluído guarda o preço, a duração e o nome do momento da reserva.
        </p>
        <p>
          Inativar tira o serviço do site e do agendamento sem apagar nada. Excluir (dentro de “Editar”) também o tira
          desta lista; quem já foi atendido com ele continua no histórico. Um serviço que faz parte de um plano precisa
          sair do plano antes de ser excluído.
        </p>
      </details>

      <ServiceFormDialog
        mode={formMode}
        onClose={() => setFormOpen(false)}
        onDelete={(service) => {
          setFormOpen(false);
          askConfirm({ type: "delete", service });
        }}
        onSaved={(result) => {
          setFormOpen(false);
          setNotice(null);
          finish(result);
        }}
        open={formOpen}
        openKey={openKey}
      />

      <ConfirmDialog
        confirm={confirm}
        onClose={() => setConfirmOpen(false)}
        onDone={(result) => {
          setConfirmOpen(false);
          setNotice(null);
          finish(result);
        }}
        open={confirmOpen}
        openKey={openKey}
        usage={confirm ? usage[confirm.service.id] : undefined}
      />
    </section>
  );
}

// --- Adicionar / editar ---

function ServiceForm({
  mode,
  dialogIds,
  nameRef,
  onClose,
  onDelete,
  onSaved,
}: {
  mode: FormMode;
  dialogIds: DialogIds;
  nameRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onDelete: (service: Service) => void;
  onSaved: (result: SiteActionResult) => void;
}) {
  const ids = useId();
  const current = mode.type === "edit" ? mode.service : null;
  const [name, setName] = useState(current?.name ?? "");
  const [description, setDescription] = useState(current?.description ?? "");
  const [duration, setDuration] = useState(current ? String(current.durationMinutes) : "30");
  const [price, setPrice] = useState(current ? formatMoneyInput(current.price) : "");
  const [payout, setPayout] = useState(current ? formatMoneyInput(current.planPayout ?? 0) : "0");
  const [icon, setIcon] = useState(current?.icon ?? "scissors");
  const [isPopular, setIsPopular] = useState(current?.isPopular ?? false);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fieldId = (field: string) => `${ids}-${field}`;

  const input = {
    name,
    description,
    durationMinutes: Number(duration),
    price: parseMoney(price),
    planPayout: parseMoney(payout),
    icon,
    isPopular,
  };
  const errors: ServiceErrors = attempted ? validateService(input, serviceIconKeys) : {};
  const priceChanged = current !== null && Number.isFinite(input.price) && input.price !== current.price;
  const durationChanged = current !== null && input.durationMinutes !== current.durationMinutes;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    setFormError(null);

    const problems = validateService(input, serviceIconKeys);
    const order = ["name", "description", "durationMinutes", "price", "planPayout", "icon"] as const;
    const first = order.find((field) => problems[field]);
    if (first) {
      document.getElementById(fieldId(first))?.focus();
      return;
    }

    setBusy(true);
    try {
      const result = await saveServiceAction({ id: current?.id ?? null, ...input });
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

  return (
    <DialogFrame
      description={
        current
          ? "As mudanças aparecem no site e valem para os próximos agendamentos."
          : "O novo serviço entra no site e no agendamento, atendido por toda a equipe ativa."
      }
      descriptionId={dialogIds.descriptionId}
      footer={
        <>
          {current ? (
            <button
              className="admin-text-button admin-site-form__delete"
              disabled={busy}
              onClick={() => onDelete(current)}
              type="button"
            >
              <Trash2 aria-hidden="true" size={15} />
              Excluir serviço
            </button>
          ) : null}
          <button className="admin-text-button" disabled={busy} onClick={onClose} type="button">
            Cancelar
          </button>
          <SubmitButton busy={busy} busyLabel="Salvando…" label={current ? "Salvar alterações" : "Adicionar serviço"} />
        </>
      }
      onClose={onClose}
      onSubmit={submit}
      title={current ? `Editar ${current.name}` : "Novo serviço"}
      titleId={dialogIds.titleId}
    >
      <Field error={errors.name} id={fieldId("name")} label="Nome">
        <input
          aria-describedby={errors.name ? `${fieldId("name")}-message` : undefined}
          aria-invalid={errors.name ? true : undefined}
          autoComplete="off"
          id={fieldId("name")}
          maxLength={serviceLimits.name}
          onChange={(event) => setName(event.target.value)}
          ref={nameRef}
          type="text"
          value={name}
        />
      </Field>

      <Field
        error={errors.description}
        hint={`${description.trim().length}/${serviceLimits.description} caracteres.`}
        id={fieldId("description")}
        label="Descrição"
      >
        <textarea
          aria-describedby={`${fieldId("description")}-message`}
          aria-invalid={errors.description ? true : undefined}
          id={fieldId("description")}
          maxLength={serviceLimits.description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          value={description}
        />
      </Field>

      <div className="admin-form-row">
        <Field
          error={errors.durationMinutes}
          hint={
            errors.durationMinutes
              ? undefined
              : Number.isFinite(input.durationMinutes) && input.durationMinutes > 0
                ? formatDuration(input.durationMinutes)
                : undefined
          }
          id={fieldId("durationMinutes")}
          label="Duração (min)"
        >
          <input
            aria-describedby={`${fieldId("durationMinutes")}-message`}
            aria-invalid={errors.durationMinutes ? true : undefined}
            id={fieldId("durationMinutes")}
            inputMode="numeric"
            max={serviceLimits.maxDuration}
            min={serviceLimits.minDuration}
            onChange={(event) => setDuration(event.target.value)}
            step={5}
            type="number"
            value={duration}
          />
        </Field>
        <Field error={errors.price} id={fieldId("price")} label="Preço (R$)">
          <input
            aria-describedby={errors.price ? `${fieldId("price")}-message` : undefined}
            aria-invalid={errors.price ? true : undefined}
            autoComplete="off"
            id={fieldId("price")}
            inputMode="decimal"
            onChange={(event) => setPrice(event.target.value)}
            placeholder="55"
            type="text"
            value={price}
          />
        </Field>
      </div>

      {priceChanged || durationChanged ? (
        <p className="admin-dialog__alert admin-dialog__alert--info">
          <CircleAlert aria-hidden="true" size={15} />
          {priceChanged && durationChanged
            ? "O novo preço e a nova duração"
            : priceChanged
              ? "O novo preço"
              : "A nova duração"}{" "}
          valem só para os próximos agendamentos. Atendimentos já marcados e o histórico continuam como estão.
        </p>
      ) : null}

      <Field
        error={errors.planPayout}
        hint="Valor fixo pago ao profissional quando o atendimento é coberto por um plano."
        id={fieldId("planPayout")}
        label="Repasse quando coberto por plano (R$)"
      >
        <input
          aria-describedby={`${fieldId("planPayout")}-message`}
          aria-invalid={errors.planPayout ? true : undefined}
          autoComplete="off"
          id={fieldId("planPayout")}
          inputMode="decimal"
          onChange={(event) => setPayout(event.target.value)}
          type="text"
          value={payout}
        />
      </Field>

      <div className="admin-field admin-dialog__field">
        <span id={fieldId("icon-label")}>Ícone</span>
        <div aria-labelledby={fieldId("icon-label")} className="admin-icon-picker" id={fieldId("icon")} role="radiogroup">
          {serviceIconOptions.map(({ key, label, Icon }) => (
            <button
              aria-checked={icon === key}
              aria-label={label}
              className={icon === key ? "is-active" : undefined}
              key={key}
              onClick={() => setIcon(key)}
              role="radio"
              title={label}
              type="button"
            >
              <Icon aria-hidden="true" size={20} strokeWidth={1.6} />
            </button>
          ))}
        </div>
        {errors.icon ? (
          <p className="admin-field__error">
            <CircleAlert aria-hidden="true" size={13} />
            {errors.icon}
          </p>
        ) : null}
      </div>

      <label className="admin-check">
        <input checked={isPopular} onChange={(event) => setIsPopular(event.target.checked)} type="checkbox" />
        <span>
          Destacar como “Mais pedido”
          <small>Mostra o selo no site e no agendamento.</small>
        </span>
      </label>

      <FormAlert message={formError} />
    </DialogFrame>
  );
}

function ServiceFormDialog({
  open,
  openKey,
  mode,
  onClose,
  onDelete,
  onSaved,
}: {
  open: boolean;
  openKey: number;
  mode: FormMode;
  onClose: () => void;
  onDelete: (service: Service) => void;
  onSaved: (result: SiteActionResult) => void;
}) {
  const dialogIds = useDialogIds();
  const nameRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog
      className="admin-dialog"
      describedBy={dialogIds.descriptionId}
      initialFocusRef={nameRef}
      labelledBy={dialogIds.titleId}
      onClose={onClose}
      open={open}
    >
      <ServiceForm
        dialogIds={dialogIds}
        key={openKey}
        mode={mode}
        nameRef={nameRef}
        onClose={onClose}
        onDelete={onDelete}
        onSaved={onSaved}
      />
    </Dialog>
  );
}

// --- Confirmações: inativar e excluir ---

function ConfirmForm({
  confirm,
  usage,
  dialogIds,
  onClose,
  onDone,
}: {
  confirm: NonNullable<Confirm>;
  usage: ServiceUsage | undefined;
  dialogIds: DialogIds;
  onClose: () => void;
  onDone: (result: SiteActionResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { service } = confirm;
  const isDelete = confirm.type === "delete";
  const upcoming = usage?.upcoming ?? 0;
  const plans = usage?.plans ?? [];
  // Serviço de plano não pode ser excluído: precisa sair do plano antes.
  const blocked = isDelete && plans.length > 0;
  const keepsHistory = isDelete && Boolean(usage?.hasHistory);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || blocked) return;
    setBusy(true);
    setFormError(null);
    try {
      const result = isDelete ? await deleteServiceAction(service.id) : await setServiceActiveAction(service.id, false);
      if (!result.ok) {
        setFormError(result.message);
        setBusy(false);
        return;
      }
      onDone(result);
    } catch {
      setFormError(unexpected);
      setBusy(false);
    }
  }

  return (
    <DialogFrame
      description={
        blocked
          ? `Faz parte de: ${formatPlans(plans)}. Tire o serviço desses planos antes de excluir. Se quiser só tirá-lo do site, use “Inativar”.`
          : !isDelete
            ? "Sai do site e do agendamento online. Nada é apagado: o histórico continua no painel e dá para ativar de novo."
            : keepsHistory
              ? "Sai do site, do agendamento e desta lista, e não pode ser reativado. Os atendimentos com ele continuam guardados e aparecem no fechamento dos períodos em que foram feitos."
              : "O serviço nunca foi agendado e será apagado de vez. Esta ação não pode ser desfeita."
      }
      descriptionId={dialogIds.descriptionId}
      footer={
        <>
          <button className="admin-text-button" disabled={busy} onClick={onClose} type="button">
            {blocked ? "Fechar" : "Cancelar"}
          </button>
          {blocked ? null : (
            <SubmitButton
              busy={busy}
              busyLabel={isDelete ? "Excluindo…" : "Inativando…"}
              label={isDelete ? (keepsHistory ? "Excluir" : "Excluir de vez") : "Inativar"}
            />
          )}
        </>
      }
      onClose={onClose}
      onSubmit={submit}
      title={blocked ? `${service.name} está em um plano` : isDelete ? `Excluir ${service.name}?` : `Inativar ${service.name}?`}
      titleId={dialogIds.titleId}
    >
      {!isDelete && plans.length ? (
        <p className="admin-dialog__alert">
          <CircleAlert aria-hidden="true" size={15} />
          Faz parte de: {formatPlans(plans)}. Enquanto estiver inativo, os assinantes não conseguem agendar este
          benefício pelo site.
        </p>
      ) : null}
      {!blocked && upcoming > 0 ? (
        <p className="admin-dialog__alert">
          <CircleAlert aria-hidden="true" size={15} />
          {upcoming === 1
            ? "Há 1 horário agendado daqui para frente com este serviço."
            : `Há ${upcoming} horários agendados daqui para frente com este serviço.`}{" "}
          Eles não são cancelados: continuam na agenda com o preço e a duração da reserva.
        </p>
      ) : null}
      <FormAlert message={formError} />
    </DialogFrame>
  );
}

function ConfirmDialog({
  open,
  openKey,
  confirm,
  usage,
  onClose,
  onDone,
}: {
  open: boolean;
  openKey: number;
  confirm: Confirm;
  usage: ServiceUsage | undefined;
  onClose: () => void;
  onDone: (result: SiteActionResult) => void;
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
      {confirm ? (
        <ConfirmForm
          confirm={confirm}
          dialogIds={dialogIds}
          key={openKey}
          onClose={onClose}
          onDone={onDone}
          usage={usage}
        />
      ) : null}
    </Dialog>
  );
}
