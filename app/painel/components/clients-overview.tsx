"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import {
  addDays,
  billingRules,
  clients,
  formatCurrency,
  formatShortDate,
  getClientProfile,
  type ClientProfile,
  type MembershipStatus,
  type PaymentMethod,
  type PlanPayment,
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
    normalize(profile.client.name).includes(term) ||
    (digits.length > 0 && profile.client.phone.replace(/\D/g, "").includes(digits))
  );
}

function getWhatsappUrl(phone: string) {
  return `https://wa.me/55${phone.replace(/\D/g, "")}`;
}

/** Texto da coluna "Mensalidade" conforme a situação. */
function BillingCell({ profile, date, payments }: { profile: ClientProfile; date: string; payments: PlanPayment[] }) {
  const oldest = profile.openPayments[0];

  if (profile.membership === "atrasado" && oldest) {
    return (
      <>
        <span className="admin-row__service">
          {formatCurrency(profile.openAmount)} em aberto
        </span>
        <span className="admin-row__note">
          Atrasada há {profile.daysOverdue} dias · plano bloqueado desde{" "}
          {formatShortDate(addDays(oldest.dueDate, billingRules.graceDays + 1))}
        </span>
      </>
    );
  }

  if (profile.membership === "pendente" && oldest) {
    return (
      <>
        <span className="admin-row__service">
          {formatCurrency(profile.openAmount)} vencida em {formatShortDate(oldest.dueDate)}
        </span>
        <span className="admin-row__price">
          Plano cobre até {formatShortDate(addDays(oldest.dueDate, billingRules.graceDays))}
        </span>
      </>
    );
  }

  if (profile.membership === "ativo" && profile.subscription) {
    const next = payments
      .filter((payment) => payment.subscriptionId === profile.subscription!.id && payment.dueDate > date)
      .sort((first, second) => first.dueDate.localeCompare(second.dueDate))[0];
    return (
      <>
        <span className="admin-row__service">Em dia</span>
        <span className="admin-row__price">
          {next ? `Próxima em ${formatShortDate(next.dueDate)}` : `Assinante desde ${formatShortDate(profile.subscription.startedAt)}`}
        </span>
      </>
    );
  }

  if (profile.membership === "congelado" && profile.subscription) {
    return (
      <>
        <span className="admin-row__service">Plano congelado</span>
        <span className="admin-row__price">
          Desde {formatShortDate(profile.subscription.startedAt)} · sem mensalidade
        </span>
      </>
    );
  }

  if (profile.membership === "ex_assinante" && profile.lastEnded) {
    return (
      <>
        <span className="admin-row__service">Encerrado em {formatShortDate(profile.lastEnded.endedAt!)}</span>
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
  payments,
  onRegisterPayment,
}: {
  date: string;
  payments: PlanPayment[];
  onRegisterPayment: (paymentId: string, method: PaymentMethod) => void;
}) {
  const [filter, setFilter] = useState<ClientFilter>("todos");
  const [search, setSearch] = useState("");

  const profiles = clients
    .map((client) => getClientProfile(client, date, payments))
    .sort(
      (first, second) =>
        statusOrder[first.membership] - statusOrder[second.membership] ||
        first.client.name.localeCompare(second.client.name, "pt-BR"),
    );
  const counts = Object.fromEntries(
    filterOptions.map((option) => [option.value, profiles.filter((profile) => matchesFilter(profile, option.value)).length]),
  ) as Record<ClientFilter, number>;
  const overdueCount = profiles.filter((profile) => profile.membership === "atrasado").length;
  const visible = profiles.filter((profile) => matchesFilter(profile, filter) && matchesSearch(profile, search));

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

      {visible.length === 0 ? (
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
                <ClientRow
                  date={date}
                  key={profile.client.id}
                  onRegisterPayment={onRegisterPayment}
                  payments={payments}
                  profile={profile}
                />
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
  date,
  payments,
  onRegisterPayment,
}: {
  profile: ClientProfile;
  date: string;
  payments: PlanPayment[];
  onRegisterPayment: (paymentId: string, method: PaymentMethod) => void;
}) {
  const { client, plan, lastPayment } = profile;
  const oldest = profile.openPayments[0];

  return (
    <tr className={`admin-row admin-row--${profile.membership}`}>
      <th scope="row">
        <span className="admin-row__client">{client.name}</span>
        <MembershipTag planName={plan?.name} status={profile.membership} />
      </th>
      <td data-label="WhatsApp">
        <a className="admin-link" href={getWhatsappUrl(client.phone)} rel="noreferrer" target="_blank">
          {client.phone}
        </a>
        {client.whatsappOptIn ? null : <span className="admin-row__price">Sem aceite para lembretes</span>}
      </td>
      <td data-label="Plano">
        {plan ? (
          <>
            <span className="admin-row__service">{plan.name}</span>
            <span className="admin-row__price">{formatCurrency(plan.monthlyPrice)}/mês</span>
          </>
        ) : (
          <span className="admin-row__price">—</span>
        )}
      </td>
      <td data-label="Mensalidade">
        <BillingCell date={date} payments={payments} profile={profile} />
      </td>
      <td data-label="Último pagamento">
        {lastPayment ? (
          <>
            <span className="admin-row__service">{formatShortDate(lastPayment.paidAt!)}</span>
            <span className="admin-row__price">
              {formatCurrency(lastPayment.amount)} · {paymentMethodLabels[lastPayment.method!]}
            </span>
          </>
        ) : (
          <span className="admin-row__price">—</span>
        )}
      </td>
      <td data-label="Receber">
        {oldest ? (
          <label className="admin-inline-select">
            <span className="sr-only">
              Registrar pagamento da mensalidade de {formatShortDate(oldest.dueDate)} de {client.name}
            </span>
            <select
              onChange={(event) => {
                if (event.target.value) onRegisterPayment(oldest.id, event.target.value as PaymentMethod);
              }}
              value=""
            >
              <option disabled value="">
                {formatCurrency(oldest.amount)} · venc. {formatShortDate(oldest.dueDate)}
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
