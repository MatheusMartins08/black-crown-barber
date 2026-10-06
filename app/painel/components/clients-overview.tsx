"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import {
  addDays,
  billingRules,
  formatCurrency,
  formatShortDate,
  type ClientProfile,
  type MembershipStatus,
  type PaymentMethod,
} from "../../data/painel";
import MembershipTag from "./membership-tag";

type ClientFilter = "todos" | "ativo" | "pendente" | "ex_assinante" | "avulso";

const filterOptions: { value: ClientFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "ativo", label: "Assinantes ativos" },
  { value: "pendente", label: "Pagamento pendente" },
  { value: "ex_assinante", label: "Ex-assinantes" },
  { value: "avulso", label: "Avulsos" },
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

/** Texto da coluna "Mensalidade" conforme a situação. */
function BillingCell({ profile }: { profile: ClientProfile }) {
  const oldest = profile.oldestDueDate;

  if (profile.membership === "atrasado" && oldest) {
    return (
      <>
        <span className="admin-row__service">{formatCurrency(profile.openAmount)} em aberto</span>
        <span className="admin-row__note">
          Atrasada há {profile.daysOverdue} dias · plano bloqueado desde{" "}
          {formatShortDate(addDays(oldest, billingRules.graceDays + 1))}
        </span>
      </>
    );
  }

  if (profile.membership === "pendente" && oldest) {
    return (
      <>
        <span className="admin-row__service">
          {formatCurrency(profile.openAmount)} vencida em {formatShortDate(oldest)}
        </span>
        <span className="admin-row__price">
          Plano cobre até {formatShortDate(addDays(oldest, billingRules.graceDays))}
        </span>
      </>
    );
  }

  if (profile.membership === "ativo" && profile.subscribedSince) {
    return (
      <>
        <span className="admin-row__service">Em dia</span>
        <span className="admin-row__price">Período desde {formatShortDate(profile.subscribedSince)}</span>
      </>
    );
  }

  if (profile.membership === "congelado" && profile.subscribedSince) {
    return (
      <>
        <span className="admin-row__service">Plano congelado</span>
        <span className="admin-row__price">Desde {formatShortDate(profile.subscribedSince)} · sem mensalidade</span>
      </>
    );
  }

  if (profile.membership === "ex_assinante" && profile.lastSubscriptionEndedAt) {
    return (
      <>
        <span className="admin-row__service">Encerrado em {formatShortDate(profile.lastSubscriptionEndedAt)}</span>
        {profile.openAmount > 0 ? (
          <span className="admin-row__note">{formatCurrency(profile.openAmount)} em aberto</span>
        ) : null}
      </>
    );
  }

  return <span className="admin-row__price">Sem plano</span>;
}

export default function ClientsOverview({
  date,
  profiles,
  onRegisterPayment,
}: {
  /** Hoje (a situação de cada cliente é a de hoje). */
  date: string;
  profiles: ClientProfile[];
  onRegisterPayment: (paymentId: string, method: PaymentMethod) => void;
}) {
  const [filter, setFilter] = useState<ClientFilter>("todos");
  const [search, setSearch] = useState("");

  const sorted = [...profiles].sort(
    (first, second) =>
      statusOrder[first.membership] - statusOrder[second.membership] ||
      first.name.localeCompare(second.name, "pt-BR"),
  );
  const counts = Object.fromEntries(
    filterOptions.map((option) => [option.value, sorted.filter((profile) => matchesFilter(profile, option.value)).length]),
  ) as Record<ClientFilter, number>;
  const overdueCount = sorted.filter((profile) => profile.membership === "atrasado").length;
  const visible = sorted.filter((profile) => matchesFilter(profile, filter) && matchesSearch(profile, search));

  function clearFilters() {
    setFilter("todos");
    setSearch("");
  }

  return (
    <section aria-labelledby="clientes-title" className="admin-panel admin-clients" id="clientes">
      <div className="admin-panel__heading">
        <div>
          <h2 id="clientes-title">Clientes</h2>
          <p>
            Situação em {formatShortDate(date)}. A mensalidade vence no início de cada mês do plano; depois de{" "}
            {billingRules.graceDays} dias em aberto, o plano deixa de cobrir os atendimentos.
            {overdueCount ? ` ${overdueCount} com o plano bloqueado por atraso.` : ""}
          </p>
        </div>
      </div>

      <div className="admin-filters" role="group" aria-label="Filtrar clientes">
        <div className="admin-segmented admin-clients__segmented" role="radiogroup" aria-label="Situação do cliente">
          {filterOptions.map((option) => (
            <button
              aria-checked={filter === option.value}
              className={filter === option.value ? "is-active" : undefined}
              key={option.value}
              onClick={() => setFilter(option.value)}
              role="radio"
              type="button"
            >
              {option.label}
              <span className="admin-segmented__count">{counts[option.value]}</span>
            </button>
          ))}
        </div>
        <label className="admin-field admin-clients__search">
          <span>Buscar</span>
          <input
            autoComplete="off"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nome ou WhatsApp"
            type="search"
            value={search}
          />
        </label>
      </div>

      {profiles.length === 0 ? (
        <div className="admin-empty">
          <Users aria-hidden="true" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">Nenhum cliente cadastrado ainda</p>
          <p>Os clientes entram aqui ao agendar pelo site ou ao serem cadastrados como assinantes.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="admin-empty">
          <Users aria-hidden="true" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">Nenhum cliente com esses filtros</p>
          <p>Ajuste a situação ou a busca.</p>
          <button className="admin-text-button" onClick={clearFilters} type="button">
            Limpar filtros
          </button>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--clients">
            <thead>
              <tr>
                <th scope="col">Cliente</th>
                <th scope="col">WhatsApp</th>
                <th scope="col">Plano</th>
                <th scope="col">Mensalidade</th>
                <th scope="col">Último pagamento</th>
                <th scope="col">Receber</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((profile) => (
                <ClientRow key={profile.id} onRegisterPayment={onRegisterPayment} profile={profile} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ClientRow({
  profile,
  onRegisterPayment,
}: {
  profile: ClientProfile;
  onRegisterPayment: (paymentId: string, method: PaymentMethod) => void;
}) {
  const next = profile.nextToReceive;

  return (
    <tr className={`admin-row admin-row--${profile.membership}`}>
      <th scope="row">
        <span className="admin-row__client">{profile.name}</span>
        <MembershipTag planName={profile.planName ?? undefined} status={profile.membership} />
      </th>
      <td data-label="WhatsApp">
        <a className="admin-link" href={getWhatsappUrl(profile.phone)} rel="noreferrer" target="_blank">
          {profile.phone}
        </a>
        {profile.whatsappOptIn ? null : <span className="admin-row__price">Sem aceite para lembretes</span>}
      </td>
      <td data-label="Plano">
        {profile.planName && profile.monthlyPrice !== null ? (
          <>
            <span className="admin-row__service">{profile.planName}</span>
            <span className="admin-row__price">{formatCurrency(profile.monthlyPrice)}/mês</span>
          </>
        ) : (
          <span className="admin-row__price">—</span>
        )}
      </td>
      <td data-label="Mensalidade">
        <BillingCell profile={profile} />
      </td>
      <td data-label="Último pagamento">
        {profile.lastPaidAt && profile.lastPaymentAmount !== null ? (
          <>
            <span className="admin-row__service">{formatShortDate(profile.lastPaidAt)}</span>
            <span className="admin-row__price">
              {formatCurrency(profile.lastPaymentAmount)}
              {profile.lastPaymentMethod ? ` · ${paymentMethodLabels[profile.lastPaymentMethod]}` : ""}
            </span>
          </>
        ) : (
          <span className="admin-row__price">—</span>
        )}
      </td>
      <td data-label="Receber">
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
