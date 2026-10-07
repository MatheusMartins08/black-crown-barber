"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { CircleAlert } from "lucide-react";
import useAsyncData from "../../components/use-async-data";
import { getTodayIso } from "../../data/booking";
import type { ClientProfile, PaymentMethod } from "../../data/painel";
import { fetchClientProfiles, PainelApiError, savePaymentStatus } from "../lib/painel-api";
import ClientsOverview from "./clients-overview";
import PlansOverview from "./plans-overview";
import SubscribersOverview from "./subscribers-overview";

const tabs = [
  { value: "clientes", label: "Clientes" },
  { value: "assinantes", label: "Assinantes" },
  { value: "planos", label: "Planos" },
] as const;

type Tab = (typeof tabs)[number]["value"];

function isTab(value: unknown): value is Tab {
  return tabs.some((tab) => tab.value === value);
}

function getErrorMessage(error: unknown) {
  return error instanceof PainelApiError ? error.message : "Não foi possível falar com o banco. Tente novamente.";
}

/**
 * Tela Clientes: clientes, assinantes e planos em abas. Cada aba é montada na primeira
 * visita e continua montada (filtros e listas preservados ao alternar).
 */
export default function ClientsWorkspace({ initialTab }: { initialTab?: string }) {
  const today = getTodayIso();
  const firstTab = isTab(initialTab) ? initialTab : "clientes";
  const [tab, setTab] = useState<Tab>(firstTab);
  const [visited, setVisited] = useState<Tab[]>([firstTab]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [plansMonth, setPlansMonth] = useState(today.slice(0, 7));
  const [paymentsVersion, setPaymentsVersion] = useState(0);
  // Forma marcada agora (aparece na hora; `null` = voltou a não pago) e mensalidades sendo gravadas.
  const [chosenMethods, setChosenMethods] = useState<Record<string, PaymentMethod | null>>({});
  const [savingPayments, setSavingPayments] = useState<string[]>([]);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  // Perfis compartilhados por Clientes e Planos. Ao recarregar, a lista anterior fica na
  // tela até chegar a nova.
  const loaded = useAsyncData(fetchClientProfiles);
  const [previous, setPrevious] = useState<ClientProfile[] | null>(null);
  const profiles = loaded.status === "success" ? loaded.data : previous;
  const subscriberCount = profiles?.filter((profile) => profile.membership !== "avulso").length;

  function reloadProfiles() {
    setPrevious(profiles);
    loaded.retry();
  }

  function selectTab(next: Tab, focus = false) {
    setTab(next);
    setVisited((current) => (current.includes(next) ? current : [...current, next]));
    if (focus) tabRefs.current[next]?.focus();
    // Troca a aba sem criar entrada no histórico: "voltar" leva à tela anterior.
    const { pathname } = window.location;
    window.history.replaceState(null, "", next === "clientes" ? pathname : `${pathname}?aba=${next}`);
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((item) => item.value === tab);
    const target =
      event.key === "ArrowRight"
        ? tabs[(index + 1) % tabs.length]
        : event.key === "ArrowLeft"
          ? tabs[(index - 1 + tabs.length) % tabs.length]
          : event.key === "Home"
            ? tabs[0]
            : event.key === "End"
              ? tabs[tabs.length - 1]
              : null;
    if (!target) return;
    event.preventDefault();
    selectTab(target.value, true);
  }

  // Registro manual (Pix, cartão ou dinheiro), troca da forma de um ciclo já pago ou volta
  // para não pago (`null`). A escolha aparece na hora; se o banco recusar, volta. Depois de
  // gravar, recarrega clientes e o mês dos planos: a situação do cliente e o recebido podem mudar.
  async function registerPayment(id: string, method: PaymentMethod | null) {
    const hadChoice = id in chosenMethods;
    const previousChoice = chosenMethods[id];
    setActionError(null);
    setChosenMethods((current) => ({ ...current, [id]: method }));
    setSavingPayments((current) => [...current, id]);
    try {
      await savePaymentStatus(id, method);
      reloadProfiles();
      setPaymentsVersion((version) => version + 1);
    } catch (error) {
      setChosenMethods((current) => {
        const next = { ...current };
        if (hadChoice) next[id] = previousChoice;
        else delete next[id];
        return next;
      });
      setActionError(getErrorMessage(error));
    } finally {
      setSavingPayments((current) => current.filter((item) => item !== id));
    }
  }

  const counts: Partial<Record<Tab, number | undefined>> = {
    clientes: profiles?.length,
    assinantes: subscriberCount,
  };

  const profilesError =
    loaded.status === "error" && !profiles ? (
      <div className="admin-panel">
        <div className="admin-empty" role="alert">
          <CircleAlert aria-hidden="true" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">Não foi possível carregar os clientes</p>
          <p>{getErrorMessage(loaded.error)}</p>
          <button className="admin-text-button" onClick={loaded.retry} type="button">
            Tentar de novo
          </button>
        </div>
      </div>
    ) : null;

  return (
    <main className="admin-main">
      <div className="admin-toolbar">
        <div>
          <h1>Clientes</h1>
          <p>Clientes, assinantes e planos da barbearia.</p>
        </div>
      </div>

      <div className="admin-tabs-bar">
        <div
          aria-label="Áreas de clientes"
          className="admin-segmented admin-tabs"
          onKeyDown={onTabKeyDown}
          role="tablist"
        >
          {tabs.map((item) => {
            const selected = tab === item.value;
            const count = counts[item.value];
            return (
              <button
                aria-controls={`aba-${item.value}`}
                aria-selected={selected}
                className={selected ? "is-active" : undefined}
                id={`aba-${item.value}-tab`}
                key={item.value}
                onClick={() => selectTab(item.value)}
                ref={(element) => {
                  tabRefs.current[item.value] = element;
                }}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
              >
                {item.label}
                {item.value in counts ? (
                  <span className="admin-segmented__count">{count ?? "–"}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {actionError ? (
        <div className="admin-alert" role="alert">
          <CircleAlert aria-hidden="true" size={16} />
          <span>{actionError}</span>
          <button className="admin-text-button" onClick={() => setActionError(null)} type="button">
            Fechar
          </button>
        </div>
      ) : null}

      <div aria-labelledby="aba-clientes-tab" hidden={tab !== "clientes"} id="aba-clientes" role="tabpanel">
        {visited.includes("clientes")
          ? (profilesError ?? (
              <ClientsOverview
                date={today}
                loading={!profiles}
                chosenMethods={chosenMethods}
                onRegisterPayment={registerPayment}
                savingPayments={savingPayments}
                profiles={profiles ?? []}
              />
            ))
          : null}
      </div>

      <div aria-labelledby="aba-assinantes-tab" hidden={tab !== "assinantes"} id="aba-assinantes" role="tabpanel">
        {visited.includes("assinantes") ? <SubscribersOverview onAccountsChange={reloadProfiles} today={today} /> : null}
      </div>

      <div aria-labelledby="aba-planos-tab" hidden={tab !== "planos"} id="aba-planos" role="tabpanel">
        {visited.includes("planos")
          ? (profilesError ?? (
              // Remonta depois de um pagamento para buscar o mês de novo (o mês escolhido fica).
              <PlansOverview
                key={paymentsVersion}
                month={plansMonth}
                onMonthChange={setPlansMonth}
                profiles={profiles ?? []}
                today={today}
              />
            ))
          : null}
      </div>
    </main>
  );
}
