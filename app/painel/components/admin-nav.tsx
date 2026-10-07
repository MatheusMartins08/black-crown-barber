"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, CalendarDays, Menu, PenLine, Users, WalletCards, X } from "lucide-react";
import type { StaffRole } from "../lib/staff";
import SignOutButton from "./sign-out-button";

export const adminSections = [
  { href: "/painel", label: "Visão geral", description: "Agenda e produção do dia", icon: CalendarDays },
  { href: "/painel/clientes", label: "Clientes", description: "Clientes, assinantes e planos", icon: Users },
  { href: "/painel/fechamento", label: "Fechamento", description: "Repasse da equipe por período", icon: WalletCards },
  {
    href: "/painel/site",
    label: "Edição do site",
    description: "Imagens, barbeiros, serviços, horários e planos",
    icon: PenLine,
    adminOnly: true,
  },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/painel" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Navegação da área logada. Desktop: links no cabeçalho. Até 960px: botão com o nome da
 * tela atual que abre um menu logo abaixo do cabeçalho (com conta, site e saída).
 */
export default function AdminNav({ role, userLabel }: { role: StaffRole; userLabel: string }) {
  const pathname = usePathname();
  // Rota em que o menu foi aberto: ao navegar para outra, ele fecha sozinho.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const toggleRef = useRef<HTMLButtonElement>(null);
  // Telas só do admin somem para o barbeiro (a página e o banco também conferem).
  const sections = adminSections.filter((section) => !("adminOnly" in section) || role === "admin");
  const current = sections.find((section) => isActive(pathname, section.href)) ?? sections[0];

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenOn(null);
      toggleRef.current?.focus();
    }
    // O menu só existe até 960px: ao alargar a janela, fecha.
    const desktop = window.matchMedia("(min-width: 961px)");
    function onDesktopChange(event: MediaQueryListEvent) {
      if (event.matches) setOpenOn(null);
    }

    document.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onDesktopChange);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onDesktopChange);
    };
  }, [open]);

  const close = () => setOpenOn(null);

  return (
    <>
      <nav aria-label="Telas do painel" className="admin-header__nav">
        {sections.map((section) => (
          <Link
            aria-current={isActive(pathname, section.href) ? "page" : undefined}
            href={section.href}
            key={section.href}
          >
            {section.label}
          </Link>
        ))}
      </nav>

      <div className="admin-header__meta admin-header__meta--account">
        <Link className="admin-header__site-link" href="/">
          Ver site
          <ArrowUpRight aria-hidden="true" size={14} />
        </Link>
        {userLabel ? (
          <span className="admin-header__user" title={userLabel}>
            {userLabel}
          </span>
        ) : null}
        <SignOutButton />
      </div>

      <button
        aria-controls="admin-menu"
        aria-expanded={open}
        aria-label={open ? "Fechar menu" : `Abrir menu. Tela atual: ${current.label}`}
        className="admin-menu-toggle"
        onClick={() => setOpenOn(open ? null : pathname)}
        ref={toggleRef}
        type="button"
      >
        <span className="admin-menu-toggle__label">{current.label}</span>
        {open ? <X aria-hidden="true" size={18} /> : <Menu aria-hidden="true" size={18} />}
      </button>

      <div aria-hidden="true" className={`admin-menu__scrim${open ? " is-open" : ""}`} onClick={close} />

      <div className={`admin-menu${open ? " is-open" : ""}`} id="admin-menu">
        <nav aria-label="Telas do painel">
          <ul className="admin-menu__list">
            {sections.map((section) => {
              const Icon = section.icon;
              const active = isActive(pathname, section.href);
              return (
                <li key={section.href}>
                  <Link
                    aria-current={active ? "page" : undefined}
                    className="admin-menu__item"
                    href={section.href}
                    onClick={close}
                  >
                    <Icon aria-hidden="true" size={18} strokeWidth={1.7} />
                    <span>
                      <span className="admin-menu__label">{section.label}</span>
                      <span className="admin-menu__description">{section.description}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="admin-menu__account">
          {userLabel ? <span className="admin-menu__user">{userLabel}</span> : null}
          <div className="admin-menu__links">
            <Link className="admin-header__site-link" href="/" onClick={close}>
              Ver site
              <ArrowUpRight aria-hidden="true" size={14} />
            </Link>
            <SignOutButton />
          </div>
        </div>
      </div>
    </>
  );
}
