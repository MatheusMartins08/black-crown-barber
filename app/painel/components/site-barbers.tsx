"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  ImageUp,
  Pencil,
  Trash2,
  Undo2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import Dialog from "../../components/dialog";
import {
  getPositionY,
  professionalLimits,
  validateProfessional,
  type Professional,
  type ProfessionalErrors,
} from "../../data/professionals";
import { formatBytes, imageRules, validateImageFile } from "../../data/site-media";
import { uploadSiteImage } from "../lib/image-upload";
import type { ProfessionalUsage } from "../lib/staff";
import {
  deleteProfessionalAction,
  moveProfessionalAction,
  saveProfessionalAction,
  setProfessionalActiveAction,
  type SiteActionResult,
} from "../site-actions";
import { DialogFrame, Field, FormAlert, SubmitButton, useDialogIds, type DialogIds } from "./admin-form";
import BarberAvatar from "./barber-avatar";
import { usePainelProfessionals } from "./painel-catalog";

type Notice = { tone: "success" | "error"; message: string } | null;
type FormMode = { type: "create" } | { type: "edit"; professional: Professional };
type Confirm = { type: "deactivate" | "delete"; professional: Professional } | null;

const unexpected = "Não foi possível falar com o servidor. Verifique a conexão e tente de novo.";

/**
 * Edição do site > Barbeiros: a equipe que aparece na landing, no agendamento e no painel.
 * Ninguém com histórico é apagado: sai do site ao ser inativado e continua nos registros.
 */
export default function SiteBarbers({ usage }: { usage: Record<string, ProfessionalUsage> }) {
  const router = useRouter();
  const professionals = usePainelProfessionals();
  const [notice, setNotice] = useState<Notice>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>({ type: "create" });
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [openKey, setOpenKey] = useState(0);

  const activeCount = professionals.filter((professional) => professional.isActive).length;
  const locked = busyId !== null || refreshing;

  /** Mostra o resultado e recarrega os dados do servidor (layout do painel e esta página). */
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
    <section aria-labelledby="barbeiros-title" className="admin-panel admin-site">
      <div className="admin-panel__heading admin-panel__heading--split">
        <div>
          <h2 id="barbeiros-title">Barbeiros</h2>
          <p>
            {activeCount} de {professionals.length} no site e no agendamento. A ordem da lista é a do site.
          </p>
        </div>
        <button
          className="button button--compact admin-action"
          disabled={locked}
          onClick={() => openForm({ type: "create" })}
          type="button"
        >
          <UserPlus aria-hidden="true" size={15} />
          Adicionar barbeiro
        </button>
      </div>

      {notice ? (
        <div className={`admin-alert${notice.tone === "success" ? " admin-alert--success" : ""}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.tone === "success" ? <CircleCheck aria-hidden="true" size={16} /> : <CircleAlert aria-hidden="true" size={16} />}
          <span>{notice.message}</span>
          <button className="admin-text-button" onClick={() => setNotice(null)} type="button">
            Fechar
          </button>
        </div>
      ) : null}

      {professionals.length === 0 ? (
        <div className="admin-empty">
          <UsersRound aria-hidden="true" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">Nenhum barbeiro cadastrado</p>
          <p>Adicione o primeiro profissional para ele aparecer no site e no agendamento.</p>
        </div>
      ) : (
        <ol aria-busy={refreshing || undefined} className="admin-site-list">
          {professionals.map((professional, index) => {
            const busy = busyId === professional.id;
            return (
              <li
                className={`admin-site-item${professional.isActive ? "" : " is-inactive"}`}
                key={professional.id}
              >
                <span className="admin-site-item__media">
                  <BarberAvatar professionalId={professional.id} size={48} />
                </span>
                <div className="admin-site-item__body">
                  <p className="admin-site-item__title">
                    {professional.name}
                    <span className={`admin-tag ${professional.isActive ? "admin-tag--plan" : "admin-tag--former"}`}>
                      {professional.isActive ? "Ativo" : "Inativo"}
                    </span>
                  </p>
                  <p className="admin-site-item__meta">{professional.specialty || "Sem especialidade"}</p>
                </div>
                <div className="admin-site-item__actions">
                  <span className="admin-site-item__order">
                    <button
                      aria-label={`Subir ${professional.name} na ordem`}
                      className="admin-icon-button"
                      disabled={locked || index === 0}
                      onClick={() => run(professional.id, () => moveProfessionalAction(professional.id, -1))}
                      title="Subir"
                      type="button"
                    >
                      <ArrowUp aria-hidden="true" size={16} />
                    </button>
                    <button
                      aria-label={`Descer ${professional.name} na ordem`}
                      className="admin-icon-button"
                      disabled={locked || index === professionals.length - 1}
                      onClick={() => run(professional.id, () => moveProfessionalAction(professional.id, 1))}
                      title="Descer"
                      type="button"
                    >
                      <ArrowDown aria-hidden="true" size={16} />
                    </button>
                  </span>
                  <button
                    className="admin-text-button admin-row__action"
                    disabled={locked}
                    onClick={() => openForm({ type: "edit", professional })}
                    type="button"
                  >
                    <Pencil aria-hidden="true" size={15} />
                    Editar
                    <span className="sr-only"> {professional.name}</span>
                  </button>
                  <button
                    aria-busy={busy || undefined}
                    className="admin-text-button admin-row__action"
                    disabled={locked}
                    onClick={() =>
                      professional.isActive
                        ? askConfirm({ type: "deactivate", professional })
                        : run(professional.id, () => setProfessionalActiveAction(professional.id, true))
                    }
                    type="button"
                  >
                    {professional.isActive ? <EyeOff aria-hidden="true" size={15} /> : <Eye aria-hidden="true" size={15} />}
                    {professional.isActive ? "Inativar" : "Ativar"}
                    <span className="sr-only"> {professional.name}</span>
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
          Nome, foto e descrição aparecem na seção de equipe do site, no agendamento online e no painel. Inativar tira o
          profissional do site e de novos agendamentos sem apagar nada: atendimentos e fechamentos antigos continuam com ele.
        </p>
        <p>
          Só é possível excluir de vez um cadastro que nunca teve atendimento, bloqueio de agenda ou login, como um
          cadastro feito por engano.
        </p>
      </details>

      <ProfessionalFormDialog
        canDelete={formMode.type === "edit" && !usage[formMode.professional.id]?.hasHistory}
        mode={formMode}
        onClose={() => setFormOpen(false)}
        onDelete={(professional) => {
          setFormOpen(false);
          askConfirm({ type: "delete", professional });
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
        upcoming={confirm ? (usage[confirm.professional.id]?.upcoming ?? 0) : 0}
      />
    </section>
  );
}

// --- Adicionar / editar ---

function ProfessionalForm({
  mode,
  canDelete,
  dialogIds,
  nameRef,
  onClose,
  onDelete,
  onSaved,
}: {
  mode: FormMode;
  canDelete: boolean;
  dialogIds: DialogIds;
  nameRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onDelete: (professional: Professional) => void;
  onSaved: (result: SiteActionResult) => void;
}) {
  const ids = useId();
  const current = mode.type === "edit" ? mode.professional : null;
  const [name, setName] = useState(current?.name ?? "");
  const [specialty, setSpecialty] = useState(current?.specialty ?? "");
  const [description, setDescription] = useState(current?.description ?? "");
  const [positionY, setPositionY] = useState(current ? getPositionY(current.imagePosition) : 50);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState<"upload" | "save" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fieldId = (field: string) => `${ids}-${field}`;

  // Libera a prévia da memória ao trocar de arquivo ou fechar.
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  const errors: ProfessionalErrors = attempted
    ? validateProfessional({ name, specialty, description, imagePositionY: positionY })
    : {};
  const imageSrc = preview ?? current?.imageUrl ?? null;

  function chooseFile(next: File | undefined) {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!next) return;
    const problem = validateImageFile(next);
    if (problem) {
      setFileError(problem);
      return;
    }
    setFileError(null);
    setFile(next);
    setPreview(URL.createObjectURL(next));
    // Foto nova começa centralizada; a atual mantém o enquadramento salvo.
    setPositionY(50);
  }

  function undoFile() {
    setFile(null);
    setPreview(null);
    setFileError(null);
    setPositionY(current ? getPositionY(current.imagePosition) : 50);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    setFormError(null);

    const problems = validateProfessional({ name, specialty, description, imagePositionY: positionY });
    const first = (["name", "specialty", "description"] as const).find((field) => problems[field]);
    if (first) {
      document.getElementById(fieldId(first))?.focus();
      return;
    }

    let stage: "upload" | "save" = "upload";
    try {
      let uploaded: { path: string; url: string } | null = null;
      if (file) {
        setBusy("upload");
        uploaded = await uploadSiteImage("barbers", file);
      }
      stage = "save";
      setBusy("save");
      const result = await saveProfessionalAction({
        id: current?.id ?? null,
        name,
        specialty,
        description,
        imagePositionY: positionY,
        newImageUrl: uploaded?.url ?? null,
      });
      if (!result.ok) {
        // A ação já descartou a foto enviada; a atual continua valendo.
        setFormError(result.message);
        setBusy(null);
        return;
      }
      onSaved(result);
    } catch (error) {
      // Falha no envio: nada foi gravado. Sem resposta da gravação, o resultado é incerto;
      // a foto enviada não é apagada aqui para não quebrar um cadastro que tenha sido salvo.
      setFormError(stage === "upload" && error instanceof Error ? error.message : unexpected);
      setBusy(null);
    }
  }

  return (
    <DialogFrame
      description={
        current
          ? "As mudanças aparecem no site, no agendamento e no painel depois de salvar."
          : "O novo profissional entra no site e no agendamento atendendo todos os serviços."
      }
      descriptionId={dialogIds.descriptionId}
      footer={
        <>
          {current && canDelete ? (
            <button
              className="admin-text-button admin-site-form__delete"
              disabled={busy !== null}
              onClick={() => onDelete(current)}
              type="button"
            >
              <Trash2 aria-hidden="true" size={15} />
              Excluir cadastro
            </button>
          ) : null}
          <button className="admin-text-button" disabled={busy !== null} onClick={onClose} type="button">
            Cancelar
          </button>
          <SubmitButton
            busy={busy !== null}
            busyLabel={busy === "upload" ? "Enviando foto…" : "Salvando…"}
            label={current ? "Salvar alterações" : "Adicionar barbeiro"}
          />
        </>
      }
      onClose={onClose}
      onSubmit={submit}
      title={current ? `Editar ${current.name}` : "Novo barbeiro"}
      titleId={dialogIds.titleId}
    >
      <div className="admin-field admin-dialog__field">
        <span>Foto</span>
        <div className="admin-photo">
          <div className="admin-photo__frame">
            {imageSrc ? (
              // Prévia local (blob:) ou a foto atual; o site usa next/image com o mesmo enquadramento.
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" className="admin-photo__image" src={imageSrc} style={{ objectPosition: `50% ${positionY}%` }} />
            ) : (
              <span className="admin-photo__empty">
                <ImageUp aria-hidden="true" size={22} strokeWidth={1.6} />
                Sem foto
              </span>
            )}
            {file ? <span className="admin-photo__badge">Nova foto · ainda não salva</span> : null}
          </div>
          <div className="admin-photo__controls">
            <label className="admin-toggle-button admin-photo__pick">
              <ImageUp aria-hidden="true" size={15} />
              {imageSrc ? "Trocar foto" : "Escolher foto"}
              <input
                accept={imageRules.accept}
                className="sr-only"
                disabled={busy !== null}
                onChange={(event) => chooseFile(event.target.files?.[0])}
                ref={fileInputRef}
                type="file"
              />
            </label>
            {file ? (
              <button className="admin-text-button admin-row__action" disabled={busy !== null} onClick={undoFile} type="button">
                <Undo2 aria-hidden="true" size={15} />
                Desfazer troca
              </button>
            ) : null}
          </div>
          {fileError ? (
            <p className="admin-field__error" role="alert">
              <CircleAlert aria-hidden="true" size={13} />
              {fileError}
            </p>
          ) : (
            <p className="admin-field__hint">
              JPEG, PNG, WebP ou AVIF, até {formatBytes(imageRules.maxBytes)}. A foto antiga só é substituída ao salvar.
            </p>
          )}
          {imageSrc ? (
            <label className="admin-photo__position">
              <span>Enquadramento</span>
              <input
                aria-valuetext={`${positionY}% da altura`}
                disabled={busy !== null}
                max={100}
                min={0}
                onChange={(event) => setPositionY(Number(event.target.value))}
                type="range"
                value={positionY}
              />
            </label>
          ) : null}
        </div>
      </div>

      <Field error={errors.name} id={fieldId("name")} label="Nome">
        <input
          aria-describedby={errors.name ? `${fieldId("name")}-message` : undefined}
          aria-invalid={errors.name ? true : undefined}
          autoComplete="off"
          id={fieldId("name")}
          maxLength={professionalLimits.name}
          ref={nameRef}
          onChange={(event) => setName(event.target.value)}
          type="text"
          value={name}
        />
      </Field>

      <Field
        error={errors.specialty}
        hint="Aparece acima do nome, ex.: Fades e cortes modernos."
        id={fieldId("specialty")}
        label="Especialidade"
      >
        <input
          aria-describedby={`${fieldId("specialty")}-message`}
          aria-invalid={errors.specialty ? true : undefined}
          autoComplete="off"
          id={fieldId("specialty")}
          maxLength={professionalLimits.specialty}
          onChange={(event) => setSpecialty(event.target.value)}
          type="text"
          value={specialty}
        />
      </Field>

      <Field
        error={errors.description}
        hint={`${description.trim().length}/${professionalLimits.description} caracteres.`}
        id={fieldId("description")}
        label="Descrição curta"
      >
        <textarea
          aria-describedby={`${fieldId("description")}-message`}
          aria-invalid={errors.description ? true : undefined}
          id={fieldId("description")}
          maxLength={professionalLimits.description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          value={description}
        />
      </Field>

      <FormAlert message={formError} />
    </DialogFrame>
  );
}

function ProfessionalFormDialog({
  open,
  openKey,
  mode,
  canDelete,
  onClose,
  onDelete,
  onSaved,
}: {
  open: boolean;
  openKey: number;
  mode: FormMode;
  canDelete: boolean;
  onClose: () => void;
  onDelete: (professional: Professional) => void;
  onSaved: (result: SiteActionResult) => void;
}) {
  const dialogIds = useDialogIds();
  // O primeiro campo do formulário é o de arquivo (invisível): o foco vai para o nome.
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
      <ProfessionalForm
        canDelete={canDelete}
        dialogIds={dialogIds}
        nameRef={nameRef}
        key={openKey}
        mode={mode}
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
  upcoming,
  dialogIds,
  onClose,
  onDone,
}: {
  confirm: NonNullable<Confirm>;
  upcoming: number;
  dialogIds: DialogIds;
  onClose: () => void;
  onDone: (result: SiteActionResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { professional } = confirm;
  const isDelete = confirm.type === "delete";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFormError(null);
    try {
      const result = isDelete
        ? await deleteProfessionalAction(professional.id)
        : await setProfessionalActiveAction(professional.id, false);
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
        isDelete
          ? "O cadastro não tem atendimentos, bloqueios nem login. Esta ação não pode ser desfeita."
          : "Sai da seção de equipe do site e do agendamento online. Nada é apagado: o histórico continua no painel e dá para ativar de novo."
      }
      descriptionId={dialogIds.descriptionId}
      footer={
        <>
          <button className="admin-text-button" disabled={busy} onClick={onClose} type="button">
            Cancelar
          </button>
          <SubmitButton
            busy={busy}
            busyLabel={isDelete ? "Excluindo…" : "Inativando…"}
            label={isDelete ? "Excluir de vez" : "Inativar"}
          />
        </>
      }
      onClose={onClose}
      onSubmit={submit}
      title={isDelete ? `Excluir ${professional.name}?` : `Inativar ${professional.name}?`}
      titleId={dialogIds.titleId}
    >
      {!isDelete && upcoming > 0 ? (
        <p className="admin-dialog__alert">
          <CircleAlert aria-hidden="true" size={15} />
          {upcoming === 1
            ? "Há 1 horário agendado daqui para frente com este profissional."
            : `Há ${upcoming} horários agendados daqui para frente com este profissional.`}{" "}
          Eles não são cancelados nem remarcados: continuam na agenda para você decidir o que fazer.
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
  upcoming,
  onClose,
  onDone,
}: {
  open: boolean;
  openKey: number;
  confirm: Confirm;
  upcoming: number;
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
          upcoming={upcoming}
        />
      ) : null}
    </Dialog>
  );
}
