"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { BadgePercent, CalendarClock, Images, Scissors, UsersRound, type LucideIcon } from "lucide-react";

type Section = {
  value: string;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  upcoming: string;
};

const tabs = [
  {
    value: "imagens",
    label: "Imagens",
    title: "Imagens do site",
    description: "Fotos da galeria e da seção sobre a barbearia.",
    icon: Images,
    upcoming: "Aqui você vai trocar as fotos da galeria e a imagem da barbearia, com prévia antes de salvar.",
  },
  {
    value: "barbeiros",
    label: "Barbeiros",
    title: "Barbeiros",
    description: "Equipe exibida no site e no agendamento.",
    icon: UsersRound,
    upcoming: "Aqui você vai adicionar, editar, ativar e inativar profissionais, com foto, nome e descrição.",
  },
  {
    value: "servicos",
    label: "Serviços",
    title: "Serviços",
    description: "Menu de serviços, preços e durações.",
    icon: Scissors,
    upcoming: "Aqui você vai criar e editar serviços: nome, descrição, duração, preço, ícone e status.",
  },
  {
    value: "horarios",
    label: "Horários",
    title: "Horários",
    description: "Funcionamento semanal e exceções.",
    icon: CalendarClock,
    upcoming: "Aqui você vai definir os dias e horários de atendimento, feriados, férias e horários especiais.",
  },
  {
    value: "planos",
    label: "Planos",
    title: "Planos",
    description: "Planos de assinatura e serviços incluídos.",
    icon: BadgePercent,
    upcoming: "Aqui você vai editar nome, valor, descrição e serviços incluídos de cada plano.",
  },
] as const satisfies readonly Section[];

type Tab = (typeof tabs)[number]["value"];

function isTab(value: unknown): value is Tab {
  return tabs.some((tab) => tab.value === value);
}

/**
 * Tela Edição do site: conteúdo variável do site em abas (mesmo padrão da tela Clientes).
 * A troca de aba fica na URL (?aba=) sem criar entrada no histórico.
 */
export default function SiteEditorWorkspace({ initialTab }: { initialTab?: string }) {
  const [tab, setTab] = useState<Tab>(isTab(initialTab) ? initialTab : "imagens");
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  function selectTab(next: Tab, focus = false) {
    setTab(next);
    const button = tabRefs.current[next];
    if (focus) button?.focus();
    // No celular as abas rolam na horizontal: mantém a escolhida visível.
    button?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const { pathname } = window.location;
    window.history.replaceState(null, "", next === "imagens" ? pathname : `${pathname}?aba=${next}`);
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

  return (
    <main className="admin-main">
      <div className="admin-toolbar">
        <div>
          <h1>Edição do site</h1>
          <p>Conteúdo do site, do agendamento e do painel em um só lugar.</p>
        </div>
      </div>

      <div className="admin-tabs-bar">
        <div
          aria-label="Áreas da edição do site"
          className="admin-segmented admin-tabs admin-tabs--scroll"
          onKeyDown={onTabKeyDown}
          role="tablist"
        >
          {tabs.map((item) => {
            const selected = tab === item.value;
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
              </button>
            );
          })}
        </div>
      </div>

      {tabs.map((item) => {
        const Icon = item.icon;
        return (
          <div
            aria-labelledby={`aba-${item.value}-tab`}
            hidden={tab !== item.value}
            id={`aba-${item.value}`}
            key={item.value}
            role="tabpanel"
          >
            <section aria-labelledby={`${item.value}-title`} className="admin-panel">
              <div className="admin-panel__heading">
                <div>
                  <h2 id={`${item.value}-title`}>{item.title}</h2>
                  <p>{item.description}</p>
                </div>
              </div>
              <div className="admin-empty">
                <Icon aria-hidden="true" size={22} strokeWidth={1.6} />
                <p className="admin-empty__title">Em breve</p>
                <p>{item.upcoming}</p>
              </div>
            </section>
          </div>
        );
      })}
    </main>
  );
}
