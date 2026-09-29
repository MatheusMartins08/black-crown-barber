"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown, Menu, X } from "lucide-react";
import { navigationItems, siteConfig } from "../data/site";

export default function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    const updateScrollState = () => setHasScrolled(window.scrollY > 12);

    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });

    return () => window.removeEventListener("scroll", updateScrollState);
  }, []);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className={`site-header${hasScrolled ? " is-scrolled" : ""}`}>
      <div className="site-header__inner">
        <Link className="brand" href="#inicio" onClick={closeMenu}>
          <Crown aria-hidden="true" className="brand__icon" strokeWidth={1.6} />
          <span className="brand__name">
            <span>Black Crown</span>
            <span className="brand__descriptor">Barber</span>
          </span>
        </Link>

        <button
          aria-controls="primary-navigation"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          className="menu-toggle"
          onClick={() => setMenuOpen((isOpen) => !isOpen)}
          type="button"
        >
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>

        <nav
          aria-label="Navegação principal"
          className={`primary-nav${menuOpen ? " is-open" : ""}`}
          id="primary-navigation"
        >
          {navigationItems.map((item) => (
            <Link href={item.href} key={item.href} onClick={closeMenu}>
              {item.label}
            </Link>
          ))}
          <Link
            className="button button--compact primary-nav__mobile-cta"
            href={siteConfig.bookingUrl}
            onClick={closeMenu}
          >
            Agendar horário
          </Link>
        </nav>

        <Link
          className="button button--compact site-header__cta"
          href={siteConfig.bookingUrl}
        >
          Agendar horário
        </Link>
      </div>

      <Link className="mobile-booking-bar" href={siteConfig.bookingUrl}>
        Agendar horário
      </Link>
    </header>
  );
}