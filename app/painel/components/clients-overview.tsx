"use client";

import { useMemo, useState } from "react";
import { LoaderCircle, RotateCw, Users } from "lucide-react";
import useAsyncData from "../../components/use-async-data";
import {
  addDays,
  billingRules,
  formatCurrency,
  formatFullDate,
  formatPeriodLabel,
  formatShortDate,
  getHistoryStart,
  getPeriodRange,
  type Appointment,
  type ClientProfile,
  type MembershipStatus,
  type PaymentMethod,
  type Period,
} from "../../data/painel";
import { fetchAppointments, PainelApiError } from "../lib/painel-api";
import MembershipTag from "./membership-tag";
import ShowMore, { listPageSize } from "./show-more";

type ClientFilter = "todos" | "ativo" | "pendente" | "ex_assinante" | "avulso";
type VisitPeriod = "base" | Period;

const filterOptions: { value: ClientFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "ativo", label: "Assinantes ativos" },
  { value: "pendente", label: "Pagamento pendente" },
  { value: "ex_assinante", label: "Ex-assinantes" },
  { value: "avulso", label: "Avulsos" },
];

const visitPeriodOptions: { value: VisitPeriod; label: string }[] = [
  { value: "base", label: "Toda a base" },
  { value: "dia", label: "No dia" },
  { value: "semana", label: "Na semana" },
  { value: "mes", label: "No mês" },
];

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  pix: "Pix",
  cartao: "Cartão",
  dinheiro: "Dinheiro",
};

// Quem precisa de ação aparece primeiro.
const statusOrder: Record<MembershipStatus, number> = {
  atrasado: 0,
  pendente: 1,
  ativo: 2,
  congelado: 3,
  ex_assinante: 4,
  avulso: 5,
};

/** Atendimentos concluídos do cliente no período escolhido. */
type Visits = { count: number; last: Appointment };

function matchesFilter(profile: ClientProfile, filter: ClientFilter) {
  if (filter === "todos") return true;
  if (filter === "pendente") return profile.membership === "pendente" || profile.membership === "atrasado";
  return profile.membership === filter;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function matchesSearch(profile: ClientProfile, search: string) {
  const term = normalize(search.trim());
  if (!term) return true;
  const digits = term.replace(/\D/g, "");
  return (
    normalize(profile.name).includes(term) ||
    (digits.length > 0 && profile.phone.replace(/\D/g, "").includes(digits))
  );
}

function getWhatsappUrl(phone: string) {
  return `https://wa.me/55${phone.replace(/\D/g, "")}`;
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Texto da coluna "Mensalidade" conforme a situação. `null` = sem plano. */
function getBilling(profile: ClientProfile): { main: string; detail?: string; warning?: boolean } | null {
  const oldest = profile.oldestDueDate;

  if (profile.membership === "atrasado" && oldest) {
    return {
      main: `${formatCurrency(profile.openAmount)} em aberto`,
      detail: `Atrasada há ${profile.daysOverdue} dias · plano bloqueado desde ${formatShortDate(
        addDays(oldest, billingRules.graceDays + 1),
      )}`,
      warning: true,
    };
  }

  if (profile.membership === "pendente" && oldest) {
    return {
      main: `${formatCurrency(profile.openAmount)} vencida em ${formatShortDate(oldest)}`,
      detail: `Plano cobre até ${formatShortDate(addDays(oldest, billingRules.graceDays))}`,
    };
  }

  if (profile.membership === "ativo" && profile.subscribedSince) {
    return { main: "Em dia", detail: `Período desde ${formatShortDate(profile.subscribedSince)}` };
  }

  if (profile.membership === "congelado" && profile.subscribedSince) {
    return { main: "Plano congelado", detail: `Desde ${formatShortDate(profile.subscribedSince)} · sem mensalidade` };
  }

  if (profile.membership === "ex_assinante" && profile.lastSubscriptionEndedAt) {
    return {
      main: `Encerrado em ${formatShortDate(profile.lastSubscriptionEndedAt)}`,
      detail: profile.openAmount > 0 ? `${formatCurrency(profile.openAmount)} em aberto` : undefined,
      warning: profile.openAmount > 0,
    };
  }

  return null;
}

function getErrorMessage(error: unknown) {
  return error instanceof PainelApiError ? error.message : "Não foi possível carregar os atendimentos.";
}

export default function ClientsOverview({
  date,
  profiles,
  loading,
  onRegisterPayment,
}: {
  /** Hoje (a situação de cada cliente é a de hoje). */
  date: string;
  profiles: ClientProfile[];
  loading: boolean;
  onRegisterPayment: (paymentId: string, method: PaymentMethod) => void;
}) {
  const [filter, setFilter] = useState<ClientFilter>("todos");
  const [search, setSearch] = useState("");
  const [visitPeriod, setVisitPeriod] = useState<VisitPeriod>("base");
  const [visitDate, setVisitDate] = useState(date);
  const [limit, setLimit] = useState(listPageSize);
  const minDate = getHistoryStart(date);

  // Com um período escolhido, a lista mostra só quem foi atendido nele.
  const range = visitPeriod === "base" ? null : getPeriodRange(visitDate, visitPeriod);
  const rangeStart = range?.start;
  const rangeEnd = range?.end;
  const visitsLoader = useMemo(
    () => (rangeStart && rangeEnd ? () => fetchAppointments({ start: rangeStart, end: rangeEnd }) : null),
    [rangeStart, rangeEnd],
  );
  const visitsLoaded = useAsyncData(visitsLoader);
  const visitsByClient = useMemo(() => {
    if (visitsLoaded.status !== "success") return null;
    const visits = new Map<string, Visits>();
    for (const appointment of visitsLoaded.data) {
      if (appointment.status !== "concluido") continue;
      const current = visits.get(appointment.clientId);
      // Vêm em ordem de horário: o último lido é o mais recente.
      visits.set(appointment.clientId, { count: (current?.count ?? 0) + 1, last: appointment });
    }
    return visits;
  }, [visitsLoaded]);

  const byPeriod = useMemo(() => {
    const sorted = [...profiles].sort(
      (first, second) =>
        statusOrder[first.membership] - statusOrder[second.membership] ||
        first.name.localeCompare(second.name, "pt-BR"),
    );
    if (visitPeriod === "base") return sorted;
    return visitsByClient ? sorted.filter((profile) => visitsByClient.has(profile.id)) : [];
  }, [profiles, visitPeriod, visitsByClient]);

  const counts = Object.fromEntries(
    filterOptions.map((option) => [option.value, byPeriod.filter((profile) => matchesFilter(profile, option.value)).length]),
  ) as Record<ClientFilter, number>;
  const overdueCount = byPeriod.filter((profile) => profile.membership === "atrasado").length;
  const visible = byPeriod.filter((profile) => matchesFilter(profile, filter) && matchesSearch(profile, search));
  const waitingVisits = visitPeriod !== "base" && visitsLoaded.status !== "success";

  function changeFilters(apply: () => void) {
    apply();
    setLimit(listPageSize);
  }

  function clearFilters() {
    changeFilters(() => {
      setFilter("todos");
      setSearch("");
      setVisitPeriod("base");
    });
  }

  return (
    <section aria-labelledby="clientes-title" className="admin-panel admin-clients" id="clientes">
      <div className="admin-panel__heading">
        <div>
          <h2 id="clientes-title">Clientes</h2>
          <p>
            {visitPeriod === "base"
              ? `Situação em ${formatShortDate(date)}.`
              : `Atendidos · ${formatPeriodLabel(visitDate, visitPeriod).toLowerCase()}: ${plural(byPeriod.length, "cliente", "clientes")}.`}
            {overdueCount ? ` ${overdueCount} com o plano bloqueado por atraso.` : ""}
          </p>
        </div>
      </div>

      <div className="admin-filters admin-filters--clients" role="group" aria-label="Filtrar clientes">
        <div className="admin-segmented admin-clients__segmented" role="radiogroup" aria-label="Situação do cliente">
          {filterOptions.map((option) => (
            <button
              aria-checked={filter === option.value}
              className={filter === option.value ? "is-active" : undefined}
              key={option.value}
              onClick={() => changeFilters(() => setFilter(option.value))}
              role="radio"
              type="button"
            >
              {option.label}
              <span className="admin-segmented__count">{loading || waitingVisits ? "–" : counts[option.value]}</span>
            </button>
          ))}
        </div>
        <label className="admin-field admin-clients__search">
          <span>Buscar</span>
          <input
            autoComplete="off"
            onChange={(event) => changeFilters(() => setSearch(event.target.value))}
            placeholder="Nome ou telefone"
            type="search"
            value={search}
          />
        </label>
        <label className="admin-field admin-clients__period">
          <span>Atendidos</span>
          <select
            onChange={(event) => changeFilters(() => setVisitPeriod(event.target.value as VisitPeriod))}
            value={visitPeriod}
          >
            {visitPeriodOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {visitPeriod !== "base" ? (
          <label className="admin-field admin-clients__date">
            <span>Data</span>
            <input
              max={date}
              min={minDate}
              onChange={(event) => {
                const value = event.target.value;
                if (value && value >= minDate && value <= date) changeFilters(() => setVisitDate(value));
              }}
              type="date"
              value={visitDate}
            />
          </label>
        ) : null}
      </div>

      {loading && profiles.length === 0 ? (
        <div aria-busy="true" className="admin-empty">
          <LoaderCircle aria-hidden="true" className="admin-spinner" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">Carregando clientes…</p>
        </div>
      ) : visitPeriod !== "base" && visitsLoaded.status === "error" ? (
        <div className="admin-empty" role="alert">
          <Users aria-hidden="true" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">Não foi possível carregar os atendimentos</p>
          <p>{getErrorMessage(visitsLoaded.error)}</p>
          <button className="admin-text-button" onClick={visitsLoaded.retry} type="button">
            <RotateCw aria-hidden="true" size={13} /> Tentar novamente
          </button>
        </div>
      ) : waitingVisits ? (
        <div aria-busy="true" className="admin-empty">
          <LoaderCircle aria-hidden="true" className="admin-spinner" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">Carregando atendimentos…</p>
        </div>
      ) : profiles.length === 0 ? (
        <div className="admin-empty">
          <Users aria-hidden="true" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">Nenhum cliente cadastrado ainda</p>
          <p>Os clientes entram aqui ao agendar pelo site ou ao serem cadastrados como assinantes.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="admin-empty">
          <Users aria-hidden="true" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">Nenhum cliente com esses filtros</p>
          <p>Ajuste a situação, o período ou a busca.</p>
          <button className="admin-text-button" onClick={clearFilters} type="button">
            Limpar filtros
          </button>
        </div>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table admin-table--clients">
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">WhatsApp</th>
                  <th scope="col">Plano</th>
                  <th scope="col">Mensalidade</th>
                  <th scope="col">{visitPeriod === "base" ? "Última visita" : "No período"}</th>
                  <th scope="col">Último pagamento</th>
                  <th scope="col">Receber</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, limit).map((profile) => (
                  <ClientRow
                    key={profile.id}
                    onRegisterPayment={onRegisterPayment}
                    profile={profile}
                    visits={visitPeriod === "base" ? undefined : visitsByClient?.get(profile.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <ShowMore
            onShowMore={() => setLimit((current) => current + listPageSize)}
            shown={Math.min(limit, visible.length)}
            total={visible.length}
          />
        </>
      )}

      <details className="admin-help">
        <summary>Como funciona a mensalidade</summary>
        <p>
          A mensalidade vence no início de cada mês do plano; depois de {billingRules.graceDays} dias em aberto, o plano
          deixa de cobrir os atendimentos. Receba pelo campo “Receber” da linha do cliente (Pix, cartão ou dinheiro).
          {visitPeriod === "base"
            ? " “Última visita” conta os atendimentos concluídos guardados no histórico do painel."
            : " Com um período escolhido, a lista mostra só quem teve atendimento concluído nele."}
        </p>
      </details>
    </section>
  );
}

function ClientRow({
  profile,
  visits,
  onRegisterPayment,
}: {
  profile: ClientProfile;
  /** Presente quando a lista está filtrada por período. */
  visits?: Visits;
  onRegisterPayment: (paymentId: string, method: PaymentMethod) => void;
}) {
  const next = profile.nextToReceive;
  const billing = getBilling(profile);
  const hasPlan = Boolean(profile.planName && profile.monthlyPrice !== null);
  const hasVisit = Boolean(visits || profile.lastVisitAt);
  const hasPayment = Boolean(profile.lastPaidAt && profile.lastPaymentAmount !== null);

  return (
    <tr className={`admin-row admin-row--${profile.membership}`}>
      <th scope="row">
        <span className="admin-row__client">{profile.name}</span>
        <MembershipTag planName={profile.planName ?? undefined} status={profile.membership} />
      </th>
      <td className="admin-clients__phone" data-label="WhatsApp">
        <a className="admin-link" href={getWhatsappUrl(profile.phone)} rel="noreferrer" target="_blank">
          {profile.phone}
        </a>
        {profile.whatsappOptIn ? null : <span className="admin-row__price">Sem aceite para lembretes</span>}
      </td>
      <td className={`admin-clients__plan${hasPlan ? "" : " is-empty"}`} data-label="Plano">
        {hasPlan ? (
          <>
            <span className="admin-row__service">{profile.planName}</span>
            <span className="admin-row__price">{formatCurrency(profile.monthlyPrice ?? 0)}/mês</span>
          </>
        ) : (
          <span className="admin-row__price">—</span>
        )}
      </td>
      <td className={`admin-clients__billing${billing ? "" : " is-empty"}`} data-label="Mensalidade">
        {billing ? (
          <>
            <span className="admin-row__service">{billing.main}</span>
            {billing.detail ? (
              <span className={billing.warning ? "admin-row__note" : "admin-row__price"}>{billing.detail}</span>
            ) : null}
          </>
        ) : (
          <span className="admin-row__price">Sem plano</span>
        )}
      </td>
      <td
        className={`admin-clients__visit has-inline-label${hasVisit ? "" : " is-empty"}`}
        data-label={visits ? "No período" : "Última visita"}
      >
        {visits ? (
          <>
            <span className="admin-row__service">{plural(visits.count, "atendimento", "atendimentos")}</span>
            <span className="admin-row__price">
              Último: {visits.last.serviceName} com {visits.last.performedBy} em {formatShortDate(visits.last.date)}
            </span>
          </>
        ) : profile.lastVisitAt ? (
          <>
            <span className="admin-row__service">{formatFullDate(profile.lastVisitAt)}</span>
            <span className="admin-row__price">{plural(profile.visitCount, "visita", "visitas")}</span>
          </>
        ) : (
          <span className="admin-row__price">—</span>
        )}
      </td>
      <td
        className={`admin-clients__payment has-inline-label${hasPayment ? "" : " is-empty"}`}
        data-label="Último pagamento"
      >
        {hasPayment && profile.lastPaidAt ? (
          <>
            <span className="admin-row__service">{formatShortDate(profile.lastPaidAt)}</span>
            <span className="admin-row__price">
              {formatCurrency(profile.lastPaymentAmount ?? 0)}
              {profile.lastPaymentMethod ? ` · ${paymentMethodLabels[profile.lastPaymentMethod]}` : ""}
            </span>
          </>
        ) : (
          <span className="admin-row__price">—</span>
        )}
      </td>
      <td className={`admin-clients__receive${next ? "" : " is-empty"}`} data-label="Receber">
        {next ? (
          <label className="admin-inline-select">
            <span className="sr-only">
              Registrar pagamento da mensalidade de {formatShortDate(next.dueDate)} de {profile.name}
            </span>
            <select
              onChange={(event) => {
                if (event.target.value) onRegisterPayment(next.id, event.target.value as PaymentMethod);
              }}
              value=""
            >
              <option disabled value="">
                {formatCurrency(next.amount)} · venc. {formatShortDate(next.dueDate)}
              </option>
              {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map((method) => (
                <option key={method} value={method}>
                  Recebido em {paymentMethodLabels[method]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="admin-row__price">—</span>
        )}
      </td>
    </tr>
  );
}
