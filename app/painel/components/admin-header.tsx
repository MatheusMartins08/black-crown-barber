import Link from "next/link";
import { ArrowUpRight, Crown } from "lucide-react";

const sections = [
  { label: "Produção", href: "#producao" },
  { label: "Agenda", href: "#agenda" },
  { label: "Fechamento", href: "#fechamento" },
  { label: "Planos", href: "#planos" },
];

export default function AdminHeader() {
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

        <nav aria-label="Seções do painel" className="admin-header__nav">
          {sections.map((section) => (
            <a href={section.href} key={section.href}>
              {section.label}
            </a>
          ))}
        </nav>

        <div className="admin-header__meta">
          <span className="admin-badge">Dados demonstrativos</span>
          <Link className="admin-header__site-link" href="/">
            Ver site
            <ArrowUpRight aria-hidden="true" size={14} />
          </Link>
        </div>
      </div>
    </header>
  );
}
