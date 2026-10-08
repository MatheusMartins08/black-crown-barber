"use client";

import { useId, useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CalendarX2, CircleAlert, CircleCheck, Plus, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import Dialog from "../../components/dialog";
import { getTodayIso } from "../../data/booking";
import {
  describeException,
  exceptionKindLabels,
  formatPeriods,
  ownedBy,
  professionalExceptionKindLabels,
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
import { getFirstName } from "../../data/professionals";
import {
  deleteExceptionAction,
  resetWeekAction,
  saveExceptionAction,
  saveWeekAction,
  type ScheduleActionResult,
  type ScheduleConflict,
  type SiteActionResult,
} from "../site-actions";
import { DialogFrame, Field, FormAlert, SubmitButton, useDialogIds, type DialogIds } from "./admin-form";
import { usePainelProfessionals, usePainelSchedule } from "./painel-catalog";

type Notice = { tone: "success" | "error"; message: string } | null;
type DraftPeriod = { key: number; weekday: number; opensAt: string; closesAt: string };

/**
 * De quem é o horário editado: a barbearia (null) ou um profissional. `self`: o próprio barbeiro
 * editando o seu (Meu horário), só muda os textos. Quem pode editar o quê o servidor confere.
 */
export type HoursScope = { professionalId: string; name: string; self: boolean } | null;

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
 * Horário semanal (um ou mais períodos por dia) e exceções. Sem escopo, é o da barbearia
 * (Edição do site > Horários): vale para o site e para o agendamento online. Com escopo, é o de
 * um profissional, limitado ao da barbearia: folgas, férias, horário especial e bloqueios dele.
 * É a mesma tela no painel do admin (qualquer profissional) e em Meu horário (só o próprio).
 * Nada cancela agendamentos: conflitos são mostrados para decisão.
 */
export default function SiteHours({ scope = null }: { scope?: HoursScope }) {
  const router = useRouter();
  const schedule = usePainelSchedule();
  const [notice, setNotice] = useState<Notice>(null);
  const [refreshing, startRefresh] = useTransition();
  const owner = scope?.professionalId ?? null;
  const shopPeriods = useMemo(() => ownedBy(schedule.periods, null), [schedule.periods]);
  const periods = useMemo(() => ownedBy(schedule.periods, owner), [schedule.periods, owner]);
  const exceptions = useMemo(() => ownedBy(schedule.exceptions, owner), [schedule.exceptions, owner]);
  // Recomeça o rascunho quando o horário salvo muda (depois de salvar e recarregar).
  const savedKey = periods.map((period) => `${period.weekday}${period.opensAt}${period.closesAt}`).join();

  function finish(result: SiteActionResult) {
    setNotice(result.message ? { tone: result.ok ? "success" : "error", message: result.message } : null);
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
        key={`${owner}-${savedKey}`}
        onDone={finish}
        refreshing={refreshing}
        saved={periods}
        scope={scope}
        shopPeriods={shopPeriods}
      />

      <ExceptionsPanel exceptions={exceptions} onDone={finish} refreshing={refreshing} scope={scope} />
    </div>
  );
}

/**
 * Edição do site > Horários: escolhe de quem é o horário (barbearia ou um barbeiro ativo) e
 * mostra a mesma tela de edição.
 */
export function HoursWorkspace() {
  const ids = useId();
  const professionals = usePainelProfessionals();
  const { periods } = usePainelSchedule();
  const [owner, setOwner] = useState("barbearia");
  const team = professionals.filter((professional) => professional.isActive && !professional.deletedAt);
  const selected = team.find((professional) => professional.id === owner) ?? null;

  return (
    <div className="admin-site-stack">
      <div className="admin-panel admin-hours-owner">
        <label className="admin-field">
          <span>Horário de</span>
          <select onChange={(event) => setOwner(event.target.value)} value={selected ? owner : "barbearia"}>
            <option value="barbearia">Barbearia (site e agendamento)</option>
            {team.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.name}
                {ownedBy(periods, professional.id).length ? " · horário próprio" : " · segue a barbearia"}
              </option>
            ))}
          </select>
        </label>
        <p className="admin-field__hint" id={`${ids}-hint`}>
          O horário de cada barbeiro fica limitado ao da barbearia. Cada barbeiro também edita o próprio em Meu horário.
        </p>
      </div>

      <SiteHours
        key={selected?.id ?? "barbearia"}
        scope={selected ? { professionalId: selected.id, name: selected.name, self: false } : null}
      />
    </div>
  );
}

// --- Horário semanal ---

function WeekEditor({
  saved,
  shopPeriods,
  scope,
  refreshing,
  onDone,
}: {
  saved: readonly OpeningPeriod[];
  shopPeriods: readonly OpeningPeriod[];
  scope: HoursScope;
  refreshing: boolean;
  onDone: (result: SiteActionResult) => void;
}) {
  const ids = useId();
  const professionalId = scope?.professionalId ?? null;
  // Profissional sem semanal próprio segue o da barbearia até "Personalizar horário".
  const inherits = professionalId !== null && saved.length === 0;
  const [customizing, setCustomizing] = useState(false);
  const [draft, setDraft] = useState<DraftPeriod[]>(() => toDraft(inherits ? shopPeriods : saved));
  const [nextKey, setNextKey] = useState(Math.max(saved.length, shopPeriods.length));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ScheduleConflict[] | null>(null);
  const [conflictKey, setConflictKey] = useState(0);

  const editing = !inherits || customizing;
  const changed = inherits ? customizing : !sameWeek(draft, saved);
  const allClosed = draft.length === 0;
  const problem =
    validateWeek(draft) ??
    (professionalId && allClosed
      ? "Deixe pelo menos um dia de atendimento. Para ficar um tempo sem atender, use uma folga ou ausência."
      : null);
  const who = scope ? (scope.self ? "você atende" : `${getFirstName(scope.name)} atende`) : null;

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
    // Sugere o período seguinte: 1 h depois do fim do último, por 3 h (dá para ajustar).
    const start = last ? addMinutes(last.closesAt, 60) : "09:00";
    setDraft((list) => [...list, { key: nextKey, weekday, opensAt: start, closesAt: addMinutes(start, 180) }]);
    setNextKey((key) => key + 1);
  }

  function update(key: number, changes: Partial<DraftPeriod>) {
    setDraft((list) => list.map((period) => (period.key === key ? { ...period, ...changes } : period)));
  }

  function undo() {
    setDraft(toDraft(inherits ? shopPeriods : saved));
    setCustomizing(false);
    setError(null);
  }

  async function run(action: () => Promise<ScheduleActionResult>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
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

  function save(confirm: boolean) {
    if (busy || problem) return;
    const week = draft.map(({ weekday, opensAt, closesAt }) => ({ weekday, opensAt, closesAt }));
    return run(() => saveWeekAction(professionalId, week, confirm));
  }

  function reset() {
    if (busy || !professionalId) return;
    return run(() => resetWeekAction(professionalId));
  }

  return (
    <section aria-labelledby={`${ids}-title`} className="admin-panel admin-site">
      <div className="admin-panel__heading admin-panel__heading--split">
        <div>
          <h2 id={`${ids}-title`}>Horário semanal</h2>
          <p>
            {who
              ? `Os dias e horários em que ${who}, toda semana. Fica limitado ao horário da barbearia.`
              : "Vale toda semana, no site e no agendamento online. Use mais de um período para pausas (ex.: almoço)."}
          </p>
        </div>
        {professionalId && !inherits ? (
          <button className="admin-text-button admin-row__action" disabled={busy || refreshing} onClick={reset} type="button">
            <RotateCcw aria-hidden="true" size={15} />
            Voltar ao horário da barbearia
          </button>
        ) : null}
      </div>

      {editing ? (
        <ol aria-busy={refreshing || undefined} className="admin-week">
          {weekOrder.map((weekday) => {
            const own = draft
              .filter((period) => period.weekday === weekday)
              .sort((a, b) => a.opensAt.localeCompare(b.opensAt));
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
                    <span>{open ? (professionalId ? "Atende" : "Aberto") : professionalId ? "Folga" : "Fechado"}</span>
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
      ) : (
        // Segue a barbearia: mostra o horário dela, só para leitura, até personalizar.
        <ol aria-busy={refreshing || undefined} className="admin-week">
          {weekOrder.map((weekday) => {
            const own = shopPeriods.filter((period) => period.weekday === weekday);
            return (
              <li className={`admin-week__day admin-week__day--readonly${own.length ? "" : " is-closed"}`} key={weekday}>
                <div className="admin-week__head">
                  <span className="admin-week__name">{weekdayNames[weekday]}</span>
                  <span className="admin-week__hours">{formatPeriods(own)}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="admin-week__footer">
        {!editing ? (
          <p className="admin-field__hint">Segue o horário da barbearia. Personalize para definir dias e horários próprios.</p>
        ) : problem && changed ? (
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
          {!editing ? (
            <button
              className="button button--compact admin-action"
              disabled={busy || refreshing}
              onClick={() => setCustomizing(true)}
              type="button"
            >
              Personalizar horário
            </button>
          ) : (
            <>
              {changed ? (
                <button className="admin-text-button admin-row__action" disabled={busy} onClick={undo} type="button">
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
            </>
          )}
        </div>
      </div>

      <ConflictDialog
        conflicts={conflicts}
        description="Com o novo horário semanal, estes agendamentos ficariam fora do horário de atendimento."
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
  scope,
  refreshing,
  onDone,
}: {
  exceptions: readonly ScheduleException[];
  scope: HoursScope;
  refreshing: boolean;
  onDone: (result: SiteActionResult) => void;
}) {
  const ids = useId();
  const labels = scope ? professionalExceptionKindLabels : exceptionKindLabels;
  const [formOpen, setFormOpen] = useState(false);
  const [openKey, setOpenKey] = useState(0);
  const [removing, setRemoving] = useState<ScheduleException | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  return (
    <section aria-labelledby={`${ids}-title`} className="admin-panel admin-site">
      <div className="admin-panel__heading admin-panel__heading--split">
        <div>
          <h2 id={`${ids}-title`}>{scope ? "Folgas, ausências e bloqueios" : "Exceções e feriados"}</h2>
          <p>
            {scope
              ? "Folga, férias, horário especial ou um trecho bloqueado. Valem só nas datas escolhidas."
              : "Dias fechados, férias, horário especial ou trechos bloqueados. Valem só nas datas escolhidas."}
          </p>
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
          {scope ? "Adicionar folga ou bloqueio" : "Adicionar exceção"}
        </button>
      </div>

      {exceptions.length === 0 ? (
        <div className="admin-empty">
          <CalendarClock aria-hidden="true" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">
            {scope ? "Nenhuma folga ou bloqueio programado" : "Nenhuma exceção programada"}
          </p>
          <p>{scope ? "Vale o horário semanal em todos os dias." : "A barbearia segue o horário semanal em todos os dias."}</p>
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
                <p className="admin-site-item__title">{describeException(exception, labels)}</p>
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
                  <span className="sr-only"> {describeException(exception, labels)}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ExceptionFormDialog
        scope={scope}
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
        scope={scope}
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

const professionalKindDescriptions: Record<ExceptionKind, string> = {
  fechado: "Não atende nessas datas: folga, férias, curso. Para um dia só, use a mesma data em De e Até.",
  horario_especial: "Nessas datas vale este horário no lugar do semanal (dentro do horário da barbearia).",
  bloqueio: "Mantém o horário do dia, mas bloqueia este trecho (consulta, compromisso).",
};

function ExceptionForm({
  scope,
  dialogIds,
  onClose,
  onSaved,
}: {
  scope: HoursScope;
  dialogIds: DialogIds;
  onClose: () => void;
  onSaved: (result: SiteActionResult) => void;
}) {
  const ids = useId();
  const labels = scope ? professionalExceptionKindLabels : exceptionKindLabels;
  const descriptions = scope ? professionalKindDescriptions : kindDescriptions;
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
      const result = await saveExceptionAction(scope?.professionalId ?? null, input, confirm);
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
        description={
          scope
            ? "Com esta folga ou bloqueio, estes agendamentos ficariam fora do horário de atendimento."
            : "Com esta exceção, estes agendamentos ficariam fora do expediente."
        }
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
          <SubmitButton busy={busy} busyLabel="Conferindo…" label={scope ? "Salvar" : "Salvar exceção"} />
        </>
      }
      onClose={onClose}
      onSubmit={(event) => submit(event)}
      title={scope ? "Nova folga ou bloqueio" : "Nova exceção"}
      titleId={dialogIds.titleId}
    >
      <div className="admin-field admin-dialog__field">
        <span id={fieldId("kind")}>Tipo</span>
        <div aria-labelledby={fieldId("kind")} className="admin-kind" role="radiogroup">
          {(Object.keys(labels) as ExceptionKind[]).map((option) => (
            <button
              aria-checked={kind === option}
              className={kind === option ? "is-active" : undefined}
              key={option}
              onClick={() => setKind(option)}
              role="radio"
              type="button"
            >
              {labels[option]}
            </button>
          ))}
        </div>
        <p className="admin-field__hint">{descriptions[kind]}</p>
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

      <Field
        error={errors.reason}
        hint={scope ? "Só a equipe vê. Ex.: Folga, Férias, Consulta." : "Só a equipe vê. Ex.: Feriado, Férias, Curso."}
        id={fieldId("reason")}
        label="Motivo"
      >
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
  scope,
  open,
  openKey,
  onClose,
  onSaved,
}: {
  scope: HoursScope;
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
      <ExceptionForm dialogIds={dialogIds} key={openKey} onClose={onClose} onSaved={onSaved} scope={scope} />
    </Dialog>
  );
}

function RemoveExceptionForm({
  exception,
  scope,
  dialogIds,
  onClose,
  onDone,
}: {
  exception: ScheduleException;
  scope: HoursScope;
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
      description={
        scope
          ? "Esses dias voltam ao horário semanal e o agendamento online volta a oferecer esses horários."
          : "Esses dias voltam ao horário semanal e o agendamento online passa a oferecer os horários de novo."
      }
      descriptionId={dialogIds.descriptionId}
      footer={
        <>
          <button className="admin-text-button" disabled={busy} onClick={onClose} type="button">
            Cancelar
          </button>
          <SubmitButton busy={busy} busyLabel="Removendo…" label={scope ? "Remover" : "Remover exceção"} />
        </>
      }
      onClose={onClose}
      onSubmit={submit}
      title={`Remover “${describeException(exception, scope ? professionalExceptionKindLabels : exceptionKindLabels)}”?`}
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
  scope,
  onClose,
  onDone,
}: {
  open: boolean;
  openKey: number;
  exception: ScheduleException | null;
  scope: HoursScope;
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
        <RemoveExceptionForm
          dialogIds={dialogIds}
          exception={exception}
          key={openKey}
          onClose={onClose}
          onDone={onDone}
          scope={scope}
        />
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
