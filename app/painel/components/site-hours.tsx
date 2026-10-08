"use client";

import { useId, useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CalendarX2, CircleAlert, CircleCheck, Plus, Trash2, Undo2, X } from "lucide-react";
import Dialog from "../../components/dialog";
import { getTodayIso } from "../../data/booking";
import {
  describeException,
  exceptionKindLabels,
  validateException,
  validateWeek,
  weekOrder,
  weekdayNames,
  type ExceptionErrors,
  type ExceptionKind,
  type OpeningPeriod,
  type ScheduleException,
} from "../../data/hours";
import { formatLongDate } from "../../data/painel";
import {
  deleteExceptionAction,
  saveExceptionAction,
  saveWeekAction,
  type ScheduleActionResult,
  type ScheduleConflict,
  type SiteActionResult,
} from "../site-actions";
import { DialogFrame, Field, FormAlert, SubmitButton, useDialogIds, type DialogIds } from "./admin-form";
import { usePainelSchedule } from "./painel-catalog";

type Notice = { tone: "success" | "error"; message: string } | null;
type DraftPeriod = { key: number; weekday: number; opensAt: string; closesAt: string };

const unexpected = "Não foi possível falar com o servidor. Verifique a conexão e tente de novo.";

function toDraft(periods: readonly OpeningPeriod[]): DraftPeriod[] {
  return periods.map((period, index) => ({
    key: index,
    weekday: period.weekday,
    opensAt: period.opensAt,
    closesAt: period.closesAt,
  }));
}

function sameWeek(draft: readonly DraftPeriod[], saved: readonly OpeningPeriod[]) {
  const key = (period: { weekday: number; opensAt: string; closesAt: string }) =>
    `${period.weekday}|${period.opensAt}|${period.closesAt}`;
  return draft.map(key).sort().join() === saved.map(key).sort().join();
}

/**
 * Edição do site > Horários: o horário semanal (um ou mais períodos por dia) e as exceções
 * (feriados, férias, horário especial, bloqueio de um trecho). Valem para o site e para o
 * agendamento online. Nada cancela agendamentos: conflitos são mostrados para decisão.
 */
export default function SiteHours() {
  const router = useRouter();
  const { periods, exceptions } = usePainelSchedule();
  const [notice, setNotice] = useState<Notice>(null);
  const [refreshing, startRefresh] = useTransition();
  // Recomeça o rascunho quando o horário salvo muda (depois de salvar e recarregar).
  const savedKey = periods.map((period) => `${period.weekday}${period.opensAt}${period.closesAt}`).join();

  function finish(result: SiteActionResult) {
    if (result.message) setNotice({ tone: result.ok ? "success" : "error", message: result.message });
    if (result.ok) startRefresh(() => router.refresh());
  }

  return (
    <div className="admin-site-stack">
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

      <WeekEditor
        key={savedKey}
        onDone={(result) => {
          setNotice(null);
          finish(result);
        }}
        refreshing={refreshing}
        saved={periods}
      />

      <ExceptionsPanel
        exceptions={exceptions}
        onDone={(result) => {
          setNotice(null);
          finish(result);
        }}
        refreshing={refreshing}
      />
    </div>
  );
}

// --- Horário semanal ---

function WeekEditor({
  saved,
  refreshing,
  onDone,
}: {
  saved: readonly OpeningPeriod[];
  refreshing: boolean;
  onDone: (result: SiteActionResult) => void;
}) {
  const ids = useId();
  const [draft, setDraft] = useState<DraftPeriod[]>(() => toDraft(saved));
  const [nextKey, setNextKey] = useState(saved.length);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ScheduleConflict[] | null>(null);
  const [conflictKey, setConflictKey] = useState(0);

  const changed = !sameWeek(draft, saved);
  const problem = validateWeek(draft);
  const allClosed = draft.length === 0;

  function setDay(weekday: number, open: boolean) {
    if (open) {
      setDraft((list) => [...list, { key: nextKey, weekday, opensAt: "09:00", closesAt: "18:00" }]);
      setNextKey((key) => key + 1);
    } else {
      setDraft((list) => list.filter((period) => period.weekday !== weekday));
    }
  }

  function addPeriod(weekday: number) {
    const own = draft.filter((period) => period.weekday === weekday).sort((a, b) => a.closesAt.localeCompare(b.closesAt));
    const last = own.at(-1);
    // Sugere o período seguinte: 1 h depois do fim do último, por 3 h (o admin ajusta).
    const start = last ? addMinutes(last.closesAt, 60) : "09:00";
    setDraft((list) => [...list, { key: nextKey, weekday, opensAt: start, closesAt: addMinutes(start, 180) }]);
    setNextKey((key) => key + 1);
  }

  function update(key: number, changes: Partial<DraftPeriod>) {
    setDraft((list) => list.map((period) => (period.key === key ? { ...period, ...changes } : period)));
  }

  async function save(confirm: boolean) {
    if (busy || problem) return;
    setBusy(true);
    setError(null);
    try {
      const result: ScheduleActionResult = await saveWeekAction(
        draft.map(({ weekday, opensAt, closesAt }) => ({ weekday, opensAt, closesAt })),
        confirm,
      );
      if ("conflicts" in result) {
        setConflicts(result.conflicts);
        setConflictKey((key) => key + 1);
        setBusy(false);
        return;
      }
      setConflicts(null);
      if (!result.ok) {
        setError(result.message);
        setBusy(false);
        return;
      }
      onDone(result);
    } catch {
      setError(unexpected);
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={`${ids}-title`} className="admin-panel admin-site">
      <div className="admin-panel__heading">
        <div>
          <h2 id={`${ids}-title`}>Horário semanal</h2>
          <p>Vale toda semana, no site e no agendamento online. Use mais de um período para pausas (ex.: almoço).</p>
        </div>
      </div>

      <ol aria-busy={refreshing || undefined} className="admin-week">
        {weekOrder.map((weekday) => {
          const own = draft.filter((period) => period.weekday === weekday).sort((a, b) => a.opensAt.localeCompare(b.opensAt));
          const open = own.length > 0;
          return (
            <li className={`admin-week__day${open ? "" : " is-closed"}`} key={weekday}>
              <div className="admin-week__head">
                <span className="admin-week__name">{weekdayNames[weekday]}</span>
                <label className="admin-switch">
                  <input
                    checked={open}
                    disabled={busy}
                    onChange={(event) => setDay(weekday, event.target.checked)}
                    type="checkbox"
                  />
                  <span>{open ? "Aberto" : "Fechado"}</span>
                </label>
              </div>
              {open ? (
                <div className="admin-week__periods">
                  {own.map((period) => (
                    <div className="admin-week__period" key={period.key}>
                      <label>
                        <span className="sr-only">Início do período de {weekdayNames[weekday]}</span>
                        <input
                          disabled={busy}
                          onChange={(event) => update(period.key, { opensAt: event.target.value })}
                          step={300}
                          type="time"
                          value={period.opensAt}
                        />
                      </label>
                      <span aria-hidden="true">–</span>
                      <label>
                        <span className="sr-only">Fim do período de {weekdayNames[weekday]}</span>
                        <input
                          disabled={busy}
                          onChange={(event) => update(period.key, { closesAt: event.target.value })}
                          step={300}
                          type="time"
                          value={period.closesAt}
                        />
                      </label>
                      {own.length > 1 ? (
                        <button
                          aria-label={`Tirar o período ${period.opensAt}–${period.closesAt} de ${weekdayNames[weekday]}`}
                          className="admin-icon-button"
                          disabled={busy}
                          onClick={() => setDraft((list) => list.filter((item) => item.key !== period.key))}
                          title="Tirar período"
                          type="button"
                        >
                          <X aria-hidden="true" size={16} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <button
                    className="admin-text-button admin-row__action admin-week__add"
                    disabled={busy}
                    onClick={() => addPeriod(weekday)}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={15} />
                    Período
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="admin-week__footer">
        {problem && changed ? (
          <p className="admin-field__error" role="alert">
            <CircleAlert aria-hidden="true" size={13} />
            {problem}
          </p>
        ) : allClosed && changed ? (
          <p className="admin-field__error">
            <CircleAlert aria-hidden="true" size={13} />
            Todos os dias fechados: o agendamento online fica sem horários.
          </p>
        ) : error ? (
          <p className="admin-field__error" role="alert">
            <CircleAlert aria-hidden="true" size={13} />
            {error}
          </p>
        ) : (
          <p className="admin-field__hint">
            {changed ? "Alterações ainda não salvas." : "Os agendamentos já marcados nunca são cancelados por aqui."}
          </p>
        )}
        <div className="admin-week__actions">
          {changed ? (
            <button
              className="admin-text-button admin-row__action"
              disabled={busy}
              onClick={() => {
                setDraft(toDraft(saved));
                setError(null);
              }}
              type="button"
            >
              <Undo2 aria-hidden="true" size={15} />
              Desfazer
            </button>
          ) : null}
          <button
            aria-busy={busy || undefined}
            className="button button--compact admin-action"
            disabled={!changed || Boolean(problem) || busy || refreshing}
            onClick={() => save(false)}
            type="button"
          >
            {busy ? "Conferindo…" : "Salvar horário semanal"}
          </button>
        </div>
      </div>

      <ConflictDialog
        conflicts={conflicts}
        description="Com o novo horário semanal, estes agendamentos ficariam fora do expediente."
        onCancel={() => setConflicts(null)}
        onConfirm={() => save(true)}
        openKey={conflictKey}
        busy={busy}
      />
    </section>
  );
}

function addMinutes(time: string, minutes: number) {
  const [hours, mins] = time.split(":").map(Number);
  const total = Math.min(23 * 60 + 55, hours * 60 + mins + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// --- Exceções ---

function ExceptionsPanel({
  exceptions,
  refreshing,
  onDone,
}: {
  exceptions: readonly ScheduleException[];
  refreshing: boolean;
  onDone: (result: SiteActionResult) => void;
}) {
  const ids = useId();
  const [formOpen, setFormOpen] = useState(false);
  const [openKey, setOpenKey] = useState(0);
  const [removing, setRemoving] = useState<ScheduleException | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  return (
    <section aria-labelledby={`${ids}-title`} className="admin-panel admin-site">
      <div className="admin-panel__heading admin-panel__heading--split">
        <div>
          <h2 id={`${ids}-title`}>Exceções e feriados</h2>
          <p>Dias fechados, férias, horário especial ou trechos bloqueados. Valem só nas datas escolhidas.</p>
        </div>
        <button
          className="button button--compact admin-action"
          disabled={refreshing}
          onClick={() => {
            setOpenKey((key) => key + 1);
            setFormOpen(true);
          }}
          type="button"
        >
          <Plus aria-hidden="true" size={15} />
          Adicionar exceção
        </button>
      </div>

      {exceptions.length === 0 ? (
        <div className="admin-empty">
          <CalendarClock aria-hidden="true" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">Nenhuma exceção programada</p>
          <p>A barbearia segue o horário semanal em todos os dias.</p>
        </div>
      ) : (
        <ul aria-busy={refreshing || undefined} className="admin-site-list">
          {exceptions.map((exception) => (
            <li className="admin-site-item" key={exception.id}>
              <span className="admin-site-item__media admin-site-item__media--icon">
                {exception.kind === "fechado" ? (
                  <CalendarX2 aria-hidden="true" size={20} strokeWidth={1.6} />
                ) : (
                  <CalendarClock aria-hidden="true" size={20} strokeWidth={1.6} />
                )}
              </span>
              <div className="admin-site-item__body">
                <p className="admin-site-item__title">{describeException(exception)}</p>
                <p className="admin-site-item__meta">{exception.reason || "Sem motivo informado"}</p>
              </div>
              <div className="admin-site-item__actions">
                <button
                  className="admin-text-button admin-row__action"
                  disabled={refreshing}
                  onClick={() => {
                    setRemoving(exception);
                    setOpenKey((key) => key + 1);
                    setRemoveOpen(true);
                  }}
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={15} />
                  Remover
                  <span className="sr-only"> {describeException(exception)}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ExceptionFormDialog
        onClose={() => setFormOpen(false)}
        onSaved={(result) => {
          setFormOpen(false);
          onDone(result);
        }}
        open={formOpen}
        openKey={openKey}
      />

      <RemoveExceptionDialog
        exception={removing}
        onClose={() => setRemoveOpen(false)}
        onDone={(result) => {
          setRemoveOpen(false);
          onDone(result);
        }}
        open={removeOpen}
        openKey={openKey}
      />
    </section>
  );
}

const kindDescriptions: Record<ExceptionKind, string> = {
  fechado: "A barbearia não abre nessas datas (feriado, férias, viagem).",
  horario_especial: "Nessas datas vale este horário no lugar do semanal.",
  bloqueio: "Mantém o horário do dia, mas bloqueia este trecho (compromisso, evento).",
};

function ExceptionForm({
  dialogIds,
  onClose,
  onSaved,
}: {
  dialogIds: DialogIds;
  onClose: () => void;
  onSaved: (result: SiteActionResult) => void;
}) {
  const ids = useId();
  const today = useMemo(() => getTodayIso(), []);
  const [kind, setKind] = useState<ExceptionKind>("fechado");
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(today);
  const [opensAt, setOpensAt] = useState("09:00");
  const [closesAt, setClosesAt] = useState("12:00");
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ScheduleConflict[] | null>(null);
  const fieldId = (field: string) => `${ids}-${field}`;

  const input = { startsOn, endsOn, kind, opensAt, closesAt, reason };
  const errors: ExceptionErrors = attempted ? validateException(input, today) : {};

  async function submit(event: FormEvent<HTMLFormElement> | null, confirm = false) {
    event?.preventDefault();
    if (busy) return;
    setAttempted(true);
    setFormError(null);
    if (Object.keys(validateException(input, today)).length) return;

    setBusy(true);
    try {
      const result = await saveExceptionAction(input, confirm);
      if ("conflicts" in result) {
        setConflicts(result.conflicts);
        setBusy(false);
        return;
      }
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

  if (conflicts) {
    return (
      <ConflictList
        busy={busy}
        conflicts={conflicts}
        description="Com esta exceção, estes agendamentos ficariam fora do expediente."
        dialogIds={dialogIds}
        onCancel={() => setConflicts(null)}
        onConfirm={() => submit(null, true)}
      />
    );
  }

  return (
    <DialogFrame
      description="Vale só nas datas escolhidas. Os agendamentos já marcados nunca são cancelados por aqui."
      descriptionId={dialogIds.descriptionId}
      footer={
        <>
          <button className="admin-text-button" disabled={busy} onClick={onClose} type="button">
            Cancelar
          </button>
          <SubmitButton busy={busy} busyLabel="Conferindo…" label="Salvar exceção" />
        </>
      }
      onClose={onClose}
      onSubmit={(event) => submit(event)}
      title="Nova exceção"
      titleId={dialogIds.titleId}
    >
      <div className="admin-field admin-dialog__field">
        <span id={fieldId("kind")}>Tipo</span>
        <div aria-labelledby={fieldId("kind")} className="admin-kind" role="radiogroup">
          {(Object.keys(exceptionKindLabels) as ExceptionKind[]).map((option) => (
            <button
              aria-checked={kind === option}
              className={kind === option ? "is-active" : undefined}
              key={option}
              onClick={() => setKind(option)}
              role="radio"
              type="button"
            >
              {exceptionKindLabels[option]}
            </button>
          ))}
        </div>
        <p className="admin-field__hint">{kindDescriptions[kind]}</p>
      </div>

      <div className="admin-form-row">
        <Field error={errors.startsOn} id={fieldId("startsOn")} label="De">
          <input
            aria-invalid={errors.startsOn ? true : undefined}
            id={fieldId("startsOn")}
            min={today}
            onChange={(event) => {
              setStartsOn(event.target.value);
              if (endsOn < event.target.value) setEndsOn(event.target.value);
            }}
            type="date"
            value={startsOn}
          />
        </Field>
        <Field error={errors.endsOn} id={fieldId("endsOn")} label="Até">
          <input
            aria-invalid={errors.endsOn ? true : undefined}
            id={fieldId("endsOn")}
            min={startsOn}
            onChange={(event) => setEndsOn(event.target.value)}
            type="date"
            value={endsOn}
          />
        </Field>
      </div>

      {kind !== "fechado" ? (
        <div className="admin-field admin-dialog__field">
          <span>{kind === "bloqueio" ? "Trecho bloqueado" : "Horário especial"}</span>
          <div className="admin-week__period">
            <label>
              <span className="sr-only">Início</span>
              <input onChange={(event) => setOpensAt(event.target.value)} step={300} type="time" value={opensAt} />
            </label>
            <span aria-hidden="true">–</span>
            <label>
              <span className="sr-only">Fim</span>
              <input onChange={(event) => setClosesAt(event.target.value)} step={300} type="time" value={closesAt} />
            </label>
          </div>
          {errors.time ? (
            <p className="admin-field__error">
              <CircleAlert aria-hidden="true" size={13} />
              {errors.time}
            </p>
          ) : null}
        </div>
      ) : null}

      <Field error={errors.reason} hint="Só a equipe vê. Ex.: Feriado, Férias, Curso." id={fieldId("reason")} label="Motivo">
        <input
          aria-invalid={errors.reason ? true : undefined}
          autoComplete="off"
          id={fieldId("reason")}
          maxLength={120}
          onChange={(event) => setReason(event.target.value)}
          type="text"
          value={reason}
        />
      </Field>

      <FormAlert message={formError} />
    </DialogFrame>
  );
}

function ExceptionFormDialog({
  open,
  openKey,
  onClose,
  onSaved,
}: {
  open: boolean;
  openKey: number;
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
      <ExceptionForm dialogIds={dialogIds} key={openKey} onClose={onClose} onSaved={onSaved} />
    </Dialog>
  );
}

function RemoveExceptionForm({
  exception,
  dialogIds,
  onClose,
  onDone,
}: {
  exception: ScheduleException;
  dialogIds: DialogIds;
  onClose: () => void;
  onDone: (result: SiteActionResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFormError(null);
    try {
      const result = await deleteExceptionAction(exception.id);
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
      description="Esses dias voltam ao horário semanal e o agendamento online passa a oferecer os horários de novo."
      descriptionId={dialogIds.descriptionId}
      footer={
        <>
          <button className="admin-text-button" disabled={busy} onClick={onClose} type="button">
            Cancelar
          </button>
          <SubmitButton busy={busy} busyLabel="Removendo…" label="Remover exceção" />
        </>
      }
      onClose={onClose}
      onSubmit={submit}
      title={`Remover “${describeException(exception)}”?`}
      titleId={dialogIds.titleId}
    >
      <FormAlert message={formError} />
    </DialogFrame>
  );
}

function RemoveExceptionDialog({
  open,
  openKey,
  exception,
  onClose,
  onDone,
}: {
  open: boolean;
  openKey: number;
  exception: ScheduleException | null;
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
      {exception ? (
        <RemoveExceptionForm dialogIds={dialogIds} exception={exception} key={openKey} onClose={onClose} onDone={onDone} />
      ) : null}
    </Dialog>
  );
}

// --- Conflitos: agendamentos que ficariam fora do expediente ---

function ConflictList({
  conflicts,
  description,
  busy,
  dialogIds,
  onCancel,
  onConfirm,
}: {
  conflicts: ScheduleConflict[];
  description: string;
  busy: boolean;
  dialogIds: DialogIds;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <DialogFrame
      description={`${description} Nada será cancelado, remarcado ou apagado: eles continuam na agenda e a equipe decide o que fazer (avisar o cliente, trocar o profissional ou o horário).`}
      descriptionId={dialogIds.descriptionId}
      footer={
        <>
          <button className="admin-text-button" disabled={busy} onClick={onCancel} type="button">
            Voltar e ajustar
          </button>
          <SubmitButton busy={busy} busyLabel="Salvando…" label="Salvar mesmo assim" />
        </>
      }
      onClose={onCancel}
      onSubmit={(event) => {
        event.preventDefault();
        onConfirm();
      }}
      title={conflicts.length === 1 ? "1 agendamento afetado" : `${conflicts.length} agendamentos afetados`}
      titleId={dialogIds.titleId}
    >
      <ul className="admin-conflicts">
        {conflicts.map((conflict) => (
          <li key={conflict.id}>
            <strong>
              {formatLongDate(conflict.date)} · {conflict.time}
            </strong>
            <span>
              {conflict.clientName} · {conflict.serviceName} · {conflict.professionalName}
            </span>
          </li>
        ))}
      </ul>
    </DialogFrame>
  );
}

function ConflictDialog({
  conflicts,
  description,
  busy,
  openKey,
  onCancel,
  onConfirm,
}: {
  conflicts: ScheduleConflict[] | null;
  description: string;
  busy: boolean;
  openKey: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogIds = useDialogIds();
  return (
    <Dialog
      className="admin-dialog"
      describedBy={dialogIds.descriptionId}
      labelledBy={dialogIds.titleId}
      onClose={onCancel}
      open={conflicts !== null}
    >
      {conflicts ? (
        <ConflictList
          busy={busy}
          conflicts={conflicts}
          description={description}
          dialogIds={dialogIds}
          key={openKey}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      ) : null}
    </Dialog>
  );
}
