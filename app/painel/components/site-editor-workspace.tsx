"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import type { SiteImage } from "../../data/site-images";
import type { PlanUsage, ProfessionalUsage, ServiceUsage } from "../lib/staff";
import SiteBarbers from "./site-barbers";
import SiteHours from "./site-hours";
import SiteImages from "./site-images";
import SitePlans from "./site-plans";
import SiteServices from "./site-services";

const tabs = [
  { value: "imagens", label: "Imagens" },
  { value: "barbeiros", label: "Barbeiros" },
  { value: "servicos", label: "Serviços" },
  { value: "horarios", label: "Horários" },
  { value: "planos", label: "Planos" },
] as const;

type Tab = (typeof tabs)[number]["value"];

function isTab(value: unknown): value is Tab {
  return tabs.some((tab) => tab.value === value);
}

/**
 * Tela Edição do site: conteúdo variável do site em abas (mesmo padrão da tela Clientes).
 * A troca de aba fica na URL (?aba=) sem criar entrada no histórico.
 */
export default function SiteEditorWorkspace({
  initialTab,
  planUsage,
  professionalUsage,
  serviceUsage,
  siteImages,
}: {
  initialTab?: string;
  planUsage: Record<string, PlanUsage>;
  professionalUsage: Record<string, ProfessionalUsage>;
  serviceUsage: Record<string, ServiceUsage>;
  siteImages: SiteImage[];
}) {
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

      {tabs.map((item) => (
        <div
          aria-labelledby={`aba-${item.value}-tab`}
          hidden={tab !== item.value}
          id={`aba-${item.value}`}
          key={item.value}
          role="tabpanel"
        >
          {item.value === "imagens" ? (
            <SiteImages images={siteImages} />
          ) : item.value === "barbeiros" ? (
            <SiteBarbers usage={professionalUsage} />
          ) : item.value === "servicos" ? (
            <SiteServices usage={serviceUsage} />
          ) : item.value === "horarios" ? (
            <SiteHours />
          ) : (
            <SitePlans usage={planUsage} />
          )}
        </div>
      ))}
    </main>
  );
}
