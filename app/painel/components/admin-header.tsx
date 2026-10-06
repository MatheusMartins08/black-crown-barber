import Link from "next/link";
import { ArrowUpRight, Crown } from "lucide-react";
import SignOutButton from "./sign-out-button";

const sections = [
  { label: "Produção", href: "#producao" },
  { label: "Agenda", href: "#agenda" },
  { label: "Clientes", href: "#clientes" },
  { label: "Assinantes", href: "#assinantes" },
  { label: "Fechamento", href: "#fechamento" },
  { label: "Planos", href: "#planos" },
];

export default function AdminHeader({ showSections = true, userLabel }: { showSections?: boolean; userLabel?: string }) {
  return (
    <header className="admin-header">
      <div className="admin-header__inner">
        <Link className="brand" href="/painel">
          <Crown aria-hidden="true" className="brand__icon" strokeWidth={1.6} />
          <span className="brand__name">
            <span>Black Crown</span>
            <span className="brand__descriptor">Painel da barbearia</span>
          </span>
        </Link>

        {showSections ? (
          <nav aria-label="Seções do painel" className="admin-header__nav">
            {sections.map((section) => (
              <a href={section.href} key={section.href}>
                {section.label}
              </a>
            ))}
          </nav>
        ) : null}

        <div className="admin-header__meta">
          <Link className="admin-header__site-link" href="/">
            Ver site
            <ArrowUpRight aria-hidden="true" size={14} />
          </Link>
          {userLabel ? (
            <>
              <span className="admin-header__user">{userLabel}</span>
              <SignOutButton />
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
