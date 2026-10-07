"use client";

import { useId, useRef, useState, useTransition, type FormEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  BadgePercent,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import Dialog from "../../components/dialog";
import { formatCurrency } from "../../data/booking";
import {
  describePlanBenefits,
  planLimits,
  validatePlan,
  type PlanBenefitInput,
  type PlanErrors,
  type PlanPeriod,
  type SubscriptionPlan,
} from "../../data/plans";
import { formatMoneyInput, parseMoney, type Service } from "../../data/services";
import type { PlanUsage } from "../lib/staff";
import {
  deletePlanAction,
  movePlanAction,
  savePlanAction,
  setPlanActiveAction,
  type SiteActionResult,
} from "../site-actions";
import { DialogFrame, Field, FormAlert, SubmitButton, useDialogIds, type DialogIds } from "./admin-form";
import { usePainelPlans, usePainelServices } from "./painel-catalog";

type Notice = { tone: "success" | "error"; message: string } | null;
type FormMode = { type: "create" } | { type: "edit"; plan: SubscriptionPlan };
type Confirm = { type: "deactivate" | "delete"; plan: SubscriptionPlan } | null;

const unexpected = "Não foi possível falar com o servidor. Verifique a conexão e tente de novo.";

function formatSubscribers(count: number) {
  return count === 1 ? "1 assinante" : `${count} assinantes`;
}

/**
 * Edição do site > Planos: planos de assinatura, mensalidade e serviços incluídos (por semana
 * ou por mês). Mensalidades já geradas mantêm o valor; mudanças nos serviços valem na hora.
 */
export default function SitePlans({ usage }: { usage: Record<string, PlanUsage> }) {
  const router = useRouter();
  // Excluídos ficam só no histórico de assinaturas e mensalidades: não aparecem aqui.
  const plans = usePainelPlans().filter((plan) => plan.deletedAt === null);
  const services = usePainelServices();
  const [notice, setNotice] = useState<Notice>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>({ type: "create" });
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [openKey, setOpenKey] = useState(0);

  const activeCount = plans.filter((plan) => plan.isActive).length;
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
    <section aria-labelledby="planos-edicao-title" className="admin-panel admin-site">
      <div className="admin-panel__heading admin-panel__heading--split">
        <div>
          <h2 id="planos-edicao-title">Planos</h2>
          <p>
            {activeCount} de {plans.length} aceitando novos assinantes. Mensalidades já geradas mantêm o valor.
          </p>
        </div>
        <button
          className="button button--compact admin-action"
          disabled={locked}
          onClick={() => openForm({ type: "create" })}
          type="button"
        >
          <Plus aria-hidden="true" size={15} />
          Adicionar plano
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

      {plans.length === 0 ? (
        <div className="admin-empty">
          <BadgePercent aria-hidden="true" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">Nenhum plano cadastrado</p>
          <p>Crie um plano para cadastrar assinantes.</p>
        </div>
      ) : (
        <ol aria-busy={refreshing || undefined} className="admin-site-list">
          {plans.map((plan, index) => {
            const busy = busyId === plan.id;
            const current = usage[plan.id]?.current ?? 0;
            return (
              <li className={`admin-site-item${plan.isActive ? "" : " is-inactive"}`} key={plan.id}>
                <span className="admin-site-item__media admin-site-item__media--icon">
                  <BadgePercent aria-hidden="true" size={20} strokeWidth={1.6} />
                </span>
                <div className="admin-site-item__body">
                  <p className="admin-site-item__title">
                    {plan.name}
                    <span className={`admin-tag ${plan.isActive ? "admin-tag--plan" : "admin-tag--former"}`}>
                      {plan.isActive ? "Ativo" : "Inativo"}
                    </span>
                  </p>
                  <p className="admin-site-item__meta">
                    {formatCurrency(plan.monthlyPrice)}/mês · {formatSubscribers(current)}
                  </p>
                  <p className="admin-site-item__meta admin-site-item__meta--wrap">
                    {describePlanBenefits(plan, services) || "Sem serviços incluídos"}
                  </p>
                </div>
                <div className="admin-site-item__actions">
                  <span className="admin-site-item__order">
                    <button
                      aria-label={`Subir ${plan.name} na ordem`}
                      className="admin-icon-button"
                      disabled={locked || index === 0}
                      onClick={() => run(plan.id, () => movePlanAction(plan.id, -1))}
                      title="Subir"
                      type="button"
                    >
                      <ArrowUp aria-hidden="true" size={16} />
                    </button>
                    <button
                      aria-label={`Descer ${plan.name} na ordem`}
                      className="admin-icon-button"
                      disabled={locked || index === plans.length - 1}
                      onClick={() => run(plan.id, () => movePlanAction(plan.id, 1))}
                      title="Descer"
                      type="button"
                    >
                      <ArrowDown aria-hidden="true" size={16} />
                    </button>
                  </span>
                  <button
                    className="admin-text-button admin-row__action"
                    disabled={locked}
                    onClick={() => openForm({ type: "edit", plan })}
                    type="button"
                  >
                    <Pencil aria-hidden="true" size={15} />
                    Editar
                    <span className="sr-only"> {plan.name}</span>
                  </button>
                  <button
                    aria-busy={busy || undefined}
                    className="admin-text-button admin-row__action"
                    disabled={locked}
                    onClick={() =>
                      plan.isActive
                        ? askConfirm({ type: "deactivate", plan })
                        : run(plan.id, () => setPlanActiveAction(plan.id, true))
                    }
                    type="button"
                  >
                    {plan.isActive ? <EyeOff aria-hidden="true" size={15} /> : <Eye aria-hidden="true" size={15} />}
                    {plan.isActive ? "Inativar" : "Ativar"}
                    <span className="sr-only"> {plan.name}</span>
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
          Cada serviço do plano tem um limite por semana (segunda a domingo) ou por mês (o ciclo da mensalidade, contado a
          partir do dia em que o cliente assinou). Passou do limite, o atendimento é cobrado como avulso.
        </p>
        <p>
          A nova mensalidade vale para os próximos ciclos: as já geradas mantêm o valor. Mudanças nos serviços incluídos
          valem na hora para quem assina; atendimentos já concluídos não mudam. Inativar tira o plano das opções para novos
          assinantes, e quem já assina continua com ele.
        </p>
      </details>

      <PlanFormDialog
        mode={formMode}
        onClose={() => setFormOpen(false)}
        onDelete={(plan) => {
          setFormOpen(false);
          askConfirm({ type: "delete", plan });
        }}
        onSaved={(result) => {
          setFormOpen(false);
          setNotice(null);
          finish(result);
        }}
        open={formOpen}
        openKey={openKey}
        usage={formMode.type === "edit" ? usage[formMode.plan.id] : undefined}
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
        usage={confirm ? usage[confirm.plan.id] : undefined}
      />
    </section>
  );
}

// --- Adicionar / editar ---

type BenefitDraft = { key: number; serviceId: string; quantity: string; period: PlanPeriod };

function toDrafts(plan: SubscriptionPlan | null, services: readonly Service[]): BenefitDraft[] {
  if (!plan) return [];
  return plan.benefits.flatMap((benefit, index) => {
    const service = services.find((item) => item.slug === benefit.serviceId);
    return service
      ? [{ key: index, serviceId: service.id, quantity: String(benefit.quantity), period: benefit.period }]
      : [];
  });
}

function PlanForm({
  mode,
  usage,
  dialogIds,
  nameRef,
  onClose,
  onDelete,
  onSaved,
}: {
  mode: FormMode;
  usage: PlanUsage | undefined;
  dialogIds: DialogIds;
  nameRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onDelete: (plan: SubscriptionPlan) => void;
  onSaved: (result: SiteActionResult) => void;
}) {
  const ids = useId();
  const allServices = usePainelServices();
  const current = mode.type === "edit" ? mode.plan : null;
  const initialBenefits = toDrafts(current, allServices);
  const [name, setName] = useState(current?.name ?? "");
  const [description, setDescription] = useState(current?.description ?? "");
  const [price, setPrice] = useState(current ? formatMoneyInput(current.monthlyPrice) : "");
  const [benefits, setBenefits] = useState<BenefitDraft[]>(initialBenefits);
  const [nextKey, setNextKey] = useState(initialBenefits.length);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fieldId = (field: string) => `${ids}-${field}`;

  // Serviços que podem entrar: os em uso (ativos) e os que já estão no plano (mesmo inativos).
  const inPlan = new Set(initialBenefits.map((benefit) => benefit.serviceId));
  const serviceOptions = allServices.filter(
    (service) => !service.deletedAt && (service.isActive || inPlan.has(service.id)),
  );

  const input = {
    name,
    description,
    monthlyPrice: parseMoney(price),
    benefits: benefits.map<PlanBenefitInput>((benefit) => ({
      serviceId: benefit.serviceId,
      quantity: Number(benefit.quantity),
      period: benefit.period,
    })),
  };
  const errors: PlanErrors = attempted ? validatePlan(input) : {};
  const subscribers = usage?.current ?? 0;
  const priceChanged = current !== null && Number.isFinite(input.monthlyPrice) && input.monthlyPrice !== current.monthlyPrice;
  const benefitsChanged =
    current !== null &&
    JSON.stringify(input.benefits) !==
      JSON.stringify(
        initialBenefits.map((benefit) => ({
          serviceId: benefit.serviceId,
          quantity: Number(benefit.quantity),
          period: benefit.period,
        })),
      );

  function updateBenefit(key: number, changes: Partial<BenefitDraft>) {
    setBenefits((list) => list.map((benefit) => (benefit.key === key ? { ...benefit, ...changes } : benefit)));
  }

  function addBenefit() {
    const used = new Set(benefits.map((benefit) => benefit.serviceId));
    const next = serviceOptions.find((service) => !used.has(service.id));
    if (!next) return;
    setBenefits((list) => [...list, { key: nextKey, serviceId: next.id, quantity: "1", period: "semana" }]);
    setNextKey((key) => key + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    setFormError(null);

    const problems = validatePlan(input);
    const first = (["name", "description", "monthlyPrice", "benefits"] as const).find((field) => problems[field]);
    if (first) {
      document.getElementById(fieldId(first))?.focus();
      return;
    }

    setBusy(true);
    try {
      const result = await savePlanAction({ id: current?.id ?? null, ...input });
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

  const canAdd = benefits.length < serviceOptions.length;

  return (
    <DialogFrame
      description={
        current
          ? `${formatSubscribers(subscribers)} no momento.`
          : "O novo plano já fica disponível para cadastrar assinantes em Clientes > Assinantes."
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
              Excluir plano
            </button>
          ) : null}
          <button className="admin-text-button" disabled={busy} onClick={onClose} type="button">
            Cancelar
          </button>
          <SubmitButton busy={busy} busyLabel="Salvando…" label={current ? "Salvar alterações" : "Criar plano"} />
        </>
      }
      onClose={onClose}
      onSubmit={submit}
      title={current ? `Editar ${current.name}` : "Novo plano"}
      titleId={dialogIds.titleId}
    >
      <Field error={errors.name} id={fieldId("name")} label="Nome">
        <input
          aria-describedby={errors.name ? `${fieldId("name")}-message` : undefined}
          aria-invalid={errors.name ? true : undefined}
          autoComplete="off"
          id={fieldId("name")}
          maxLength={planLimits.name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Plano Ouro"
          ref={nameRef}
          type="text"
          value={name}
        />
      </Field>

      <Field
        error={errors.description}
        hint={`${description.trim().length}/${planLimits.description} caracteres. Aparece para a equipe no painel.`}
        id={fieldId("description")}
        label="Descrição"
      >
        <textarea
          aria-describedby={`${fieldId("description")}-message`}
          aria-invalid={errors.description ? true : undefined}
          id={fieldId("description")}
          maxLength={planLimits.description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          value={description}
        />
      </Field>

      <Field error={errors.monthlyPrice} id={fieldId("monthlyPrice")} label="Mensalidade (R$)">
        <input
          aria-describedby={errors.monthlyPrice ? `${fieldId("monthlyPrice")}-message` : undefined}
          aria-invalid={errors.monthlyPrice ? true : undefined}
          autoComplete="off"
          id={fieldId("monthlyPrice")}
          inputMode="decimal"
          onChange={(event) => setPrice(event.target.value)}
          placeholder="189"
          type="text"
          value={price}
        />
      </Field>

      {priceChanged ? (
        <p className="admin-dialog__alert admin-dialog__alert--info">
          <CircleAlert aria-hidden="true" size={15} />
          A nova mensalidade vale a partir dos próximos ciclos de cada assinante. As mensalidades já geradas continuam
          com o valor de {formatCurrency(current.monthlyPrice)}.
        </p>
      ) : null}

      <div className={`admin-field admin-dialog__field${errors.benefits ? " has-error" : ""}`}>
        <span id={fieldId("benefits-label")}>Serviços incluídos</span>
        <ul aria-labelledby={fieldId("benefits-label")} className="admin-benefits" id={fieldId("benefits")} tabIndex={-1}>
          {benefits.map((benefit) => {
            const used = new Set(benefits.filter((item) => item.key !== benefit.key).map((item) => item.serviceId));
            return (
              <li className="admin-benefit" key={benefit.key}>
                <label className="admin-benefit__service">
                  <span className="sr-only">Serviço</span>
                  <select
                    onChange={(event) => updateBenefit(benefit.key, { serviceId: event.target.value })}
                    value={benefit.serviceId}
                  >
                    {serviceOptions
                      .filter((service) => !used.has(service.id))
                      .map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name}
                          {service.isActive ? "" : " (inativo)"}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="admin-benefit__quantity">
                  <span className="sr-only">Quantidade</span>
                  <input
                    inputMode="numeric"
                    max={benefit.period === "mes" ? planLimits.maxMonthly : planLimits.maxWeekly}
                    min={1}
                    onChange={(event) => updateBenefit(benefit.key, { quantity: event.target.value })}
                    type="number"
                    value={benefit.quantity}
                  />
                </label>
                <label className="admin-benefit__period">
                  <span className="sr-only">Frequência</span>
                  <select
                    onChange={(event) => updateBenefit(benefit.key, { period: event.target.value as PlanPeriod })}
                    value={benefit.period}
                  >
                    <option value="semana">por semana</option>
                    <option value="mes">por mês</option>
                  </select>
                </label>
                <button
                  aria-label="Tirar serviço do plano"
                  className="admin-icon-button admin-benefit__remove"
                  onClick={() => setBenefits((list) => list.filter((item) => item.key !== benefit.key))}
                  title="Tirar do plano"
                  type="button"
                >
                  <X aria-hidden="true" size={16} />
                </button>
              </li>
            );
          })}
        </ul>
        {canAdd ? (
          <button className="admin-text-button admin-row__action admin-benefits__add" onClick={addBenefit} type="button">
            <Plus aria-hidden="true" size={15} />
            Adicionar serviço
          </button>
        ) : null}
        {errors.benefits ? (
          <p className="admin-field__error">
            <CircleAlert aria-hidden="true" size={13} />
            {errors.benefits}
          </p>
        ) : (
          <p className="admin-field__hint">
            Por mês = ciclo da mensalidade, contado a partir do dia em que o cliente assinou.
          </p>
        )}
      </div>

      {benefitsChanged && subscribers > 0 ? (
        <p className="admin-dialog__alert admin-dialog__alert--info">
          <CircleAlert aria-hidden="true" size={15} />
          A mudança nos serviços vale na hora para {formatSubscribers(subscribers)} deste plano. Atendimentos já concluídos
          não mudam.
        </p>
      ) : null}

      <FormAlert message={formError} />
    </DialogFrame>
  );
}

function PlanFormDialog({
  open,
  openKey,
  mode,
  usage,
  onClose,
  onDelete,
  onSaved,
}: {
  open: boolean;
  openKey: number;
  mode: FormMode;
  usage: PlanUsage | undefined;
  onClose: () => void;
  onDelete: (plan: SubscriptionPlan) => void;
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
      <PlanForm
        dialogIds={dialogIds}
        key={openKey}
        mode={mode}
        nameRef={nameRef}
        onClose={onClose}
        onDelete={onDelete}
        onSaved={onSaved}
        usage={usage}
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
  usage: PlanUsage | undefined;
  dialogIds: DialogIds;
  onClose: () => void;
  onDone: (result: SiteActionResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { plan } = confirm;
  const isDelete = confirm.type === "delete";
  const subscribers = usage?.current ?? 0;
  // Plano com assinante vigente não pode ser excluído: troque o plano deles antes.
  const blocked = isDelete && subscribers > 0;
  const keepsHistory = isDelete && Boolean(usage?.hasHistory);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || blocked) return;
    setBusy(true);
    setFormError(null);
    try {
      const result = isDelete ? await deletePlanAction(plan.id) : await setPlanActiveAction(plan.id, false);
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
          ? `${plan.name} tem ${formatSubscribers(subscribers)} no momento. Troque o plano deles em Clientes > Assinantes antes de excluir. Para só parar de vender, use “Inativar”.`
          : !isDelete
            ? `Sai das opções para novos assinantes. ${subscribers ? `Os ${formatSubscribers(subscribers)} atuais continuam com o plano, os benefícios e as mensalidades.` : "Dá para ativar de novo quando quiser."}`
            : keepsHistory
              ? "Sai desta lista e não pode ser reativado. Assinaturas e mensalidades antigas continuam no painel."
              : "O plano nunca teve assinante e será apagado de vez. Esta ação não pode ser desfeita."
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
      title={blocked ? `${plan.name} tem assinantes` : isDelete ? `Excluir ${plan.name}?` : `Inativar ${plan.name}?`}
      titleId={dialogIds.titleId}
    >
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
  usage: PlanUsage | undefined;
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
