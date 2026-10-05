"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, RotateCw, Snowflake, UserPlus, Users, XCircle } from "lucide-react";
import useAsyncData from "../../components/use-async-data";
import { describePlanBenefits, getPlan, subscriptionPlans, type PlanId } from "../../data/plans";
import {
  normalizePhone,
  subscriptionStatusLabels,
  subscriptionStatuses,
  type SubscriberAccount,
  type SubscriptionStatus,
} from "../../data/subscribers";
import {
  changeSubscriberPlan,
  changeSubscriberStatus,
  listSubscribers,
  SubscriberApiError,
} from "../../lib/subscribers-api";
import { ResetPasswordDialog, SubscriberFormDialog } from "./subscriber-dialogs";

type StatusFilter = "todos" | SubscriptionStatus;
type PlanFilter = "todos" | PlanId;

const filterOptions: { value: StatusFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "ativo", label: "Ativos" },
  { value: "congelado", label: "Congelados" },
  { value: "inativo", label: "Inativos" },
];

const statusIcons: Record<SubscriptionStatus, typeof CheckCircle2> = {
  ativo: CheckCircle2,
  congelado: Snowflake,
  inativo: XCircle,
};

type FormState = { type: "create" } | { type: "edit"; account: SubscriberAccount };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function matchesSearch(account: SubscriberAccount, search: string) {
  const term = normalize(search.trim());
  if (!term) return true;
  const digits = term.replace(/\D/g, "");
  return normalize(account.name).includes(term) || (digits.length > 0 && normalizePhone(account.phone).includes(digits));
}

function formatDate(isoDate: string) {
  return isoDate.split("-").reverse().join("/");
}

function getWhatsappUrl(phone: string) {
  return `https://wa.me/55${normalizePhone(phone)}`;
}

function upsert(list: SubscriberAccount[], account: SubscriberAccount) {
  const exists = list.some((item) => item.id === account.id);
  const next = exists ? list.map((item) => (item.id === account.id ? account : item)) : [...list, account];
  return next.sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
}

export default function SubscribersOverview() {
  const loaded = useAsyncData(listSubscribers);
  const [edited, setEdited] = useState<SubscriberAccount[] | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("todos");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("todos");
  const [search, setSearch] = useState("");
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimer = useRef<number | undefined>(undefined);

  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>({ type: "create" });
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<SubscriberAccount | null>(null);
  const [openKey, setOpenKey] = useState(0);

  useEffect(() => () => window.clearTimeout(highlightTimer.current), []);

  const accounts = edited ?? (loaded.status === "success" ? loaded.data : null);

  function setAccounts(change: (list: SubscriberAccount[]) => SubscriberAccount[]) {
    setEdited((current) => change(current ?? (loaded.status === "success" ? loaded.data : [])));
  }

  function highlight(id: string, message: string) {
    setAnnouncement(message);
    setHighlightedId(id);
    window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightedId(null), 1400);
  }

  async function applyRowChange(
    account: SubscriberAccount,
    optimistic: SubscriberAccount,
    request: () => Promise<SubscriberAccount>,
    message: string,
  ) {
    setAccounts((list) => upsert(list, optimistic));
    setPendingIds((current) => [...current, account.id]);
    setRowErrors((current) => {
      const next = { ...current };
      delete next[account.id];
      return next;
    });

    try {
      const saved = await request();
      setAccounts((list) => upsert(list, saved));
      highlight(saved.id, message);
    } catch (error) {
      setAccounts((list) => upsert(list, account));
      setRowErrors((current) => ({
        ...current,
        [account.id]: error instanceof SubscriberApiError ? error.message : "Não foi possível salvar. Tente de novo.",
      }));
    } finally {
      setPendingIds((current) => current.filter((id) => id !== account.id));
    }
  }

  function openForm(state: FormState) {
    setFormState(state);
    setOpenKey((key) => key + 1);
    setFormOpen(true);
  }

  function openPassword(account: SubscriberAccount) {
    setPasswordTarget(account);
    setOpenKey((key) => key + 1);
    setPasswordOpen(true);
  }

  function clearFilters() {
    setFilter("todos");
    setPlanFilter("todos");
    setSearch("");
  }

  const list = accounts ?? [];
  const byPlan = list.filter((account) => planFilter === "todos" || account.planId === planFilter);
  const counts = Object.fromEntries(
    filterOptions.map((option) => [
      option.value,
      byPlan.filter((account) => option.value === "todos" || account.status === option.value).length,
    ]),
  ) as Record<StatusFilter, number>;
  const visible = byPlan.filter(
    (account) => (filter === "todos" || account.status === filter) && matchesSearch(account, search),
  );
  const activeCount = list.filter((account) => account.status === "ativo").length;

  return (
    <section aria-labelledby="assinantes-title" className="admin-panel admin-subscribers" id="assinantes">
      <div className="admin-panel__heading admin-panel__heading--split">
        <div>
          <h2 id="assinantes-title">Assinantes</h2>
          <p>
            Contas de acesso ao agendamento online. O telefone é o login do cliente e a senha é definida aqui. Congelados e
            inativos entram no site, mas sem os benefícios do plano.
            {accounts ? ` ${activeCount} de ${list.length} com o plano ativo.` : ""}
          </p>
        </div>
        <button className="button button--compact admin-action" onClick={() => openForm({ type: "create" })} type="button">
          <UserPlus aria-hidden="true" size={15} />
          Novo assinante
        </button>
      </div>

      <div className="admin-filters" role="group" aria-label="Filtrar assinantes">
        <div className="admin-segmented admin-clients__segmented" role="radiogroup" aria-label="Status da assinatura">
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
              <span className="admin-segmented__count">{accounts ? counts[option.value] : "–"}</span>
            </button>
          ))}
        </div>
        <label className="admin-field">
          <span>Plano</span>
          <select onChange={(event) => setPlanFilter(event.target.value as PlanFilter)} value={planFilter}>
            <option value="todos">Todos</option>
            {subscriptionPlans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field admin-clients__search">
          <span>Buscar</span>
          <input
            autoComplete="off"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nome ou telefone"
            type="search"
            value={search}
          />
        </label>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {loaded.status === "error" && !edited ? (
        <div className="admin-empty" role="alert">
          <Users aria-hidden="true" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">Não foi possível carregar os assinantes</p>
          <p>Verifique a conexão e tente de novo.</p>
          <button className="admin-text-button" onClick={loaded.retry} type="button">
            <RotateCw aria-hidden="true" size={13} /> Tentar novamente
          </button>
        </div>
      ) : !accounts ? (
        <div aria-busy="true" className="admin-empty">
          <LoaderCircle aria-hidden="true" className="admin-spinner" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">Carregando assinantes…</p>
        </div>
      ) : list.length === 0 ? (
        <div className="admin-empty">
          <Users aria-hidden="true" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">Nenhum assinante cadastrado</p>
          <p>Cadastre o cliente depois que ele contratar e pagar o plano na barbearia.</p>
          <button className="admin-text-button" onClick={() => openForm({ type: "create" })} type="button">
            Cadastrar o primeiro assinante
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="admin-empty">
          <Users aria-hidden="true" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">Nenhum assinante com esses filtros</p>
          <p>Ajuste o status, o plano ou a busca.</p>
          <button className="admin-text-button" onClick={clearFilters} type="button">
            Limpar filtros
          </button>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--subscribers">
            <thead>
              <tr>
                <th scope="col">Assinante</th>
                <th scope="col">Telefone (login)</th>
                <th scope="col">Plano</th>
                <th scope="col">Status</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((account) => (
                <SubscriberRow
                  account={account}
                  error={rowErrors[account.id]}
                  highlighted={highlightedId === account.id}
                  key={account.id}
                  onChangePlan={(planId) =>
                    applyRowChange(
                      account,
                      { ...account, planId },
                      () => changeSubscriberPlan(account.id, planId),
                      `${account.name} agora está no ${getPlan(planId)?.name}.`,
                    )
                  }
                  onChangeStatus={(status) =>
                    applyRowChange(
                      account,
                      { ...account, status },
                      () => changeSubscriberStatus(account.id, status),
                      `Assinatura de ${account.name}: ${subscriptionStatusLabels[status].toLowerCase()}.`,
                    )
                  }
                  onEdit={() => openForm({ type: "edit", account })}
                  onResetPassword={() => openPassword(account)}
                  pending={pendingIds.includes(account.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="admin-footnote">
        Fluxo: o cliente contrata e paga o plano na barbearia → cadastre aqui o telefone, a senha, o plano e o status → no
        site, ele escolhe “Sou assinante” e entra com o telefone e a senha. A senha não aparece depois do cadastro; para
        trocar, use “Redefinir senha”.
      </p>

      <SubscriberFormDialog
        mode={formState}
        onClose={() => setFormOpen(false)}
        onSaved={(account, isNew) => {
          setAccounts((current) => upsert(current, account));
          setFormOpen(false);
          highlight(account.id, isNew ? `${account.name} cadastrado no ${getPlan(account.planId)?.name}.` : `Dados de ${account.name} atualizados.`);
        }}
        open={formOpen}
        openKey={openKey}
      />

      <ResetPasswordDialog
        account={passwordTarget}
        onClose={() => setPasswordOpen(false)}
        onDone={() => {
          setPasswordOpen(false);
          if (passwordTarget) highlight(passwordTarget.id, `Senha de ${passwordTarget.name} redefinida.`);
        }}
        open={passwordOpen}
        openKey={openKey}
      />
    </section>
  );
}

function SubscriberRow({
  account,
  pending,
  highlighted,
  error,
  onChangePlan,
  onChangeStatus,
  onEdit,
  onResetPassword,
}: {
  account: SubscriberAccount;
  pending: boolean;
  highlighted: boolean;
  error?: string;
  onChangePlan: (planId: PlanId) => void;
  onChangeStatus: (status: SubscriptionStatus) => void;
  onEdit: () => void;
  onResetPassword: () => void;
}) {
  const StatusIcon = statusIcons[account.status];
  const isInactive = account.status === "inativo";

  return (
    <tr
      aria-busy={pending || undefined}
      className={`admin-row admin-row--${account.status}${highlighted ? " admin-row--updated" : ""}`}
    >
      <th scope="row">
        <span className="admin-row__client">{account.name}</span>
        <span className="admin-row__price">Assinante desde {formatDate(account.since)}</span>
      </th>
      <td data-label="Telefone (login)">
        <a className="admin-link" href={getWhatsappUrl(account.phone)} rel="noreferrer" target="_blank">
          {account.phone}
        </a>
      </td>
      <td data-label="Plano">
        <label className="admin-inline-select">
          <span className="sr-only">Plano de {account.name}</span>
          <select
            disabled={isInactive || pending}
            onChange={(event) => onChangePlan(event.target.value as PlanId)}
            value={account.planId}
          >
            {subscriptionPlans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>
        <span className="admin-row__price">
          {isInactive ? "Reative para trocar o plano" : describePlanBenefits(account.planId)}
        </span>
      </td>
      <td data-label="Status">
        <label className={`admin-status admin-status--${account.status}`}>
          <StatusIcon aria-hidden="true" size={15} strokeWidth={1.8} />
          <span className="sr-only">Status da assinatura de {account.name}</span>
          <select
            disabled={pending}
            onChange={(event) => onChangeStatus(event.target.value as SubscriptionStatus)}
            value={account.status}
          >
            {subscriptionStatuses.map((status) => (
              <option key={status} value={status}>
                {subscriptionStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        {error ? (
          <span className="admin-row__note" role="alert">
            {error}
          </span>
        ) : null}
      </td>
      <td data-label="Ações">
        <span className="admin-row__actions">
          <button className="admin-text-button" onClick={onEdit} type="button">
            Editar
          </button>
          <button className="admin-text-button" onClick={onResetPassword} type="button">
            Redefinir senha
          </button>
        </span>
      </td>
    </tr>
  );
}
