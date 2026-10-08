// Horário de funcionamento (opening_periods) e exceções (schedule_exceptions), da barbearia
// (professionalId nulo) e de cada profissional. O banco calcula a agenda
// (private.day_periods / professional_day_periods); as funções daqui repetem a mesma regra
// para exibir horários e apontar conflitos no painel antes de salvar.
// Puro (sem React e sem rede). Datas YYYY-MM-DD e horas HH:MM, no fuso da barbearia.

export type OpeningPeriod = {
  id: string;
  /** null = barbearia; uuid = horário semanal próprio do profissional. */
  professionalId: string | null;
  /** 0 = domingo … 6 = sábado (extract(dow) do Postgres). */
  weekday: number;
  opensAt: string;
  closesAt: string;
};

export type ExceptionKind = "fechado" | "horario_especial" | "bloqueio";

export type ScheduleException = {
  id: string;
  /** null = barbearia; uuid = folga, ausência, horário especial ou bloqueio do profissional. */
  professionalId: string | null;
  startsOn: string;
  endsOn: string;
  kind: ExceptionKind;
  /** null em "fechado". */
  opensAt: string | null;
  closesAt: string | null;
  reason: string;
};

export type OpeningPeriodRow = {
  id: string;
  professional_id: string | null;
  weekday: number;
  opens_at: string;
  closes_at: string;
};
export type ScheduleExceptionRow = {
  id: string;
  professional_id: string | null;
  starts_on: string;
  ends_on: string;
  kind: ExceptionKind;
  opens_at: string | null;
  closes_at: string | null;
  reason: string | null;
};

export const openingPeriodColumns = "id, professional_id, weekday, opens_at, closes_at";
export const scheduleExceptionColumns = "id, professional_id, starts_on, ends_on, kind, opens_at, closes_at, reason";

/** "09:00:00" -> "09:00". */
export function toHourMinute(value: string) {
  return value.slice(0, 5);
}

export function toOpeningPeriod(row: OpeningPeriodRow): OpeningPeriod {
  return {
    id: row.id,
    professionalId: row.professional_id,
    weekday: row.weekday,
    opensAt: toHourMinute(row.opens_at),
    closesAt: toHourMinute(row.closes_at),
  };
}

export function toScheduleException(row: ScheduleExceptionRow): ScheduleException {
  return {
    id: row.id,
    professionalId: row.professional_id,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    kind: row.kind,
    opensAt: row.opens_at ? toHourMinute(row.opens_at) : null,
    closesAt: row.closes_at ? toHourMinute(row.closes_at) : null,
    reason: row.reason ?? "",
  };
}

export function sortPeriods<T extends { weekday?: number; opensAt: string }>(list: T[]) {
  return [...list].sort((a, b) => (a.weekday ?? 0) - (b.weekday ?? 0) || a.opensAt.localeCompare(b.opensAt));
}

// --- Exibição ---

/** Ordem de exibição: segunda a domingo. */
export const weekOrder = [1, 2, 3, 4, 5, 6, 0] as const;

export const weekdayNames = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

/** "Segunda-feira" -> "Segunda". */
export function shortWeekdayName(weekday: number) {
  return weekdayNames[weekday].replace("-feira", "");
}

/** "09:00–20:00" ou "09:00–12:00 · 13:30–20:00"; "Fechado" sem período. */
export function formatPeriods(periods: readonly Pick<OpeningPeriod, "opensAt" | "closesAt">[]) {
  if (!periods.length) return "Fechado";
  return [...periods]
    .sort((a, b) => a.opensAt.localeCompare(b.opensAt))
    .map((period) => `${period.opensAt}–${period.closesAt}`)
    .join(" · ");
}

/** Linhas do horário semanal, de segunda a domingo. */
export function getWeekSchedule(periods: readonly OpeningPeriod[]) {
  return weekOrder.map((weekday) => {
    const own = periods.filter((period) => period.weekday === weekday);
    return { weekday, day: weekdayNames[weekday], open: own.length > 0, hours: formatPeriods(own) };
  });
}

/**
 * Dias abertos em texto curto: "Segunda a sábado", "Todos os dias", "Segunda a sexta e domingo",
 * "Terça, quinta e sábado". Sequências de 3 ou mais dias viram intervalo.
 */
export function describeOpenDays(periods: readonly OpeningPeriod[]) {
  const open = weekOrder.filter((weekday) => periods.some((period) => period.weekday === weekday));
  if (!open.length) return "Sob consulta";
  if (open.length === 7) return "Todos os dias";

  const runs: number[][] = [];
  for (const weekday of open) {
    const last = runs.at(-1);
    const previous = last?.at(-1);
    if (last && previous !== undefined && weekOrder.indexOf(weekday as (typeof weekOrder)[number]) === weekOrder.indexOf(previous as (typeof weekOrder)[number]) + 1) {
      last.push(weekday);
    } else {
      runs.push([weekday]);
    }
  }
  const parts = runs.flatMap((run) =>
    run.length >= 3
      ? [`${shortWeekdayName(run[0])} a ${shortWeekdayName(run.at(-1)!).toLowerCase()}`]
      : run.map((weekday) => shortWeekdayName(weekday)),
  );
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}` : parts[0];
  return text
    .split(/(, | e )/)
    .map((piece, index) => (index === 0 ? piece : piece.toLowerCase()))
    .join("");
}

// --- Mesma regra de private.day_periods / private.day_blocks ---

function toDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`);
}

export function getWeekdayOf(isoDate: string) {
  return toDate(isoDate).getUTCDay();
}

export function coversDate(exception: Pick<ScheduleException, "startsOn" | "endsOn">, isoDate: string) {
  return exception.startsOn <= isoDate && isoDate <= exception.endsOn;
}

type PeriodLike = Pick<OpeningPeriod, "weekday" | "opensAt" | "closesAt"> & { professionalId?: string | null };
type ExceptionLike = Pick<ScheduleException, "startsOn" | "endsOn" | "kind" | "opensAt" | "closesAt"> & {
  professionalId?: string | null;
};
type DayPeriod = { opensAt: string; closesAt: string };

/** Linhas de um dono: a barbearia (null) ou um profissional. */
export function ownedBy<T extends { professionalId?: string | null }>(list: readonly T[], professionalId: string | null) {
  return list.filter((item) => (item.professionalId ?? null) === professionalId);
}

/**
 * Períodos de um dono na data: nenhum se "fechado"; os de "horário especial"; senão o semanal.
 * `null` quando não há exceção que decida e o dono não tem semanal (o profissional herda).
 */
function ownerDayPeriods(isoDate: string, periods: readonly PeriodLike[], exceptions: readonly ExceptionLike[]) {
  const today = exceptions.filter((exception) => coversDate(exception, isoDate));
  if (today.some((exception) => exception.kind === "fechado")) return [];
  const special = today.filter((exception) => exception.kind === "horario_especial");
  if (special.length) {
    return special.map((exception): DayPeriod => ({ opensAt: exception.opensAt!, closesAt: exception.closesAt! }));
  }
  if (!periods.length) return null;
  const weekday = getWeekdayOf(isoDate);
  return periods
    .filter((period) => period.weekday === weekday)
    .map((period): DayPeriod => ({ opensAt: period.opensAt, closesAt: period.closesAt }));
}

function ownerDayBlocks(isoDate: string, exceptions: readonly ExceptionLike[]) {
  return exceptions
    .filter((exception) => exception.kind === "bloqueio" && coversDate(exception, isoDate))
    .map((exception): DayPeriod => ({ opensAt: exception.opensAt!, closesAt: exception.closesAt! }));
}

/** Períodos de atendimento da barbearia na data (as linhas de profissionais são ignoradas). */
export function getDayPeriods(isoDate: string, periods: readonly PeriodLike[], exceptions: readonly ExceptionLike[]) {
  return ownerDayPeriods(isoDate, ownedBy(periods, null), ownedBy(exceptions, null)) ?? [];
}

/** Trechos bloqueados da barbearia na data (exceção "bloqueio"). */
export function getDayBlocks(isoDate: string, exceptions: readonly ExceptionLike[]) {
  return ownerDayBlocks(isoDate, ownedBy(exceptions, null));
}

// --- Mesma regra de private.professional_day_periods / professional_day_blocks ---

/**
 * Horário efetivo do profissional na data: o próprio (folga ou ausência, horário especial ou
 * semanal; sem semanal, segue a barbearia) limitado ao da barbearia. `periods` e `exceptions`
 * são todas as linhas (barbearia e profissionais).
 */
export function getProfessionalDayPeriods(
  isoDate: string,
  professionalId: string,
  periods: readonly PeriodLike[],
  exceptions: readonly ExceptionLike[],
) {
  const shop = getDayPeriods(isoDate, periods, exceptions);
  const own = ownerDayPeriods(isoDate, ownedBy(periods, professionalId), ownedBy(exceptions, professionalId));
  if (own === null) return shop;

  const result: DayPeriod[] = [];
  for (const mine of own) {
    for (const open of shop) {
      const opensAt = mine.opensAt > open.opensAt ? mine.opensAt : open.opensAt;
      const closesAt = mine.closesAt < open.closesAt ? mine.closesAt : open.closesAt;
      if (opensAt < closesAt && !result.some((item) => item.opensAt === opensAt && item.closesAt === closesAt)) {
        result.push({ opensAt, closesAt });
      }
    }
  }
  return result.sort((a, b) => a.opensAt.localeCompare(b.opensAt));
}

/** Bloqueios efetivos do profissional na data: os da barbearia e os dele. */
export function getProfessionalDayBlocks(isoDate: string, professionalId: string, exceptions: readonly ExceptionLike[]) {
  return [...getDayBlocks(isoDate, exceptions), ...ownerDayBlocks(isoDate, ownedBy(exceptions, professionalId))];
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export type ScheduledVisit = {
  id: string;
  date: string;
  time: string;
  durationMinutes: number;
  /** Quem executa: o atendimento precisa caber no horário efetivo dele. */
  professionalId: string;
};

/**
 * O atendimento cabe no horário efetivo de quem executa? Mesma regra de appointments_prepare:
 * começa e termina dentro de um único período e não encosta em trecho bloqueado.
 * `periods` e `exceptions` são todas as linhas (barbearia e profissionais).
 */
export function fitsSchedule(visit: ScheduledVisit, periods: readonly PeriodLike[], exceptions: readonly ExceptionLike[]) {
  const start = toMinutes(visit.time);
  const end = start + visit.durationMinutes;
  const inside = getProfessionalDayPeriods(visit.date, visit.professionalId, periods, exceptions).some(
    (period) => start >= toMinutes(period.opensAt) && end <= toMinutes(period.closesAt),
  );
  const blocked = getProfessionalDayBlocks(visit.date, visit.professionalId, exceptions).some(
    (block) => start < toMinutes(block.closesAt) && end > toMinutes(block.opensAt),
  );
  return inside && !blocked;
}

// --- Validação do painel ---

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isTime(value: string) {
  return timePattern.test(value);
}

/** Problema no horário semanal (ou null): horas válidas, início antes do fim, sem sobreposição no dia. */
export function validateWeek(periods: readonly Pick<OpeningPeriod, "weekday" | "opensAt" | "closesAt">[]) {
  for (const period of periods) {
    if (!Number.isInteger(period.weekday) || period.weekday < 0 || period.weekday > 6) return "Dia da semana inválido.";
    if (!isTime(period.opensAt) || !isTime(period.closesAt)) return "Preencha início e fim de todos os períodos.";
    if (period.opensAt >= period.closesAt) {
      return `${weekdayNames[period.weekday]}: o início (${period.opensAt}) precisa ser antes do fim (${period.closesAt}).`;
    }
  }
  for (const weekday of weekOrder) {
    const own = sortPeriods(periods.filter((period) => period.weekday === weekday));
    for (let index = 1; index < own.length; index += 1) {
      if (own[index].opensAt < own[index - 1].closesAt) return `${weekdayNames[weekday]}: há períodos sobrepostos.`;
    }
  }
  return null;
}

export const exceptionKindLabels: Record<ExceptionKind, string> = {
  fechado: "Fechado o dia todo",
  horario_especial: "Horário especial",
  bloqueio: "Bloquear um trecho",
};

/** Os mesmos tipos, como o profissional os chama (folga e férias são "fechado" dele). */
export const professionalExceptionKindLabels: Record<ExceptionKind, string> = {
  fechado: "Folga ou ausência (dia todo)",
  horario_especial: "Horário especial",
  bloqueio: "Bloquear um trecho",
};

export type ExceptionInput = {
  startsOn: string;
  endsOn: string;
  kind: ExceptionKind;
  opensAt: string;
  closesAt: string;
  reason: string;
};

export type ExceptionErrors = Partial<Record<"startsOn" | "endsOn" | "time" | "reason", string>>;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function validateException(input: ExceptionInput, today: string): ExceptionErrors {
  const errors: ExceptionErrors = {};
  if (!datePattern.test(input.startsOn)) errors.startsOn = "Escolha a data.";
  else if (input.startsOn < today) errors.startsOn = "Escolha hoje ou uma data futura.";
  if (!datePattern.test(input.endsOn)) errors.endsOn = "Escolha a data final.";
  else if (datePattern.test(input.startsOn) && input.endsOn < input.startsOn) errors.endsOn = "A data final vem depois da inicial.";
  if (input.kind !== "fechado") {
    if (!isTime(input.opensAt) || !isTime(input.closesAt)) errors.time = "Informe início e fim.";
    else if (input.opensAt >= input.closesAt) errors.time = "O início precisa ser antes do fim.";
  }
  if (input.reason.trim().length > 120) errors.reason = "Use até 120 caracteres.";
  return errors;
}

/** Descrição curta de uma exceção: "15/11 · Fechado o dia todo", "20/12 a 27/12 · Horário especial 09:00–12:00". */
export function describeException(
  exception: Pick<ScheduleException, "startsOn" | "endsOn" | "kind" | "opensAt" | "closesAt">,
  labels: Record<ExceptionKind, string> = exceptionKindLabels,
) {
  const format = (isoDate: string) => isoDate.split("-").reverse().slice(0, 2).join("/");
  const dates =
    exception.startsOn === exception.endsOn ? format(exception.startsOn) : `${format(exception.startsOn)} a ${format(exception.endsOn)}`;
  const label = labels[exception.kind];
  return exception.kind === "fechado" ? `${dates} · ${label}` : `${dates} · ${label} ${exception.opensAt}–${exception.closesAt}`;
}
