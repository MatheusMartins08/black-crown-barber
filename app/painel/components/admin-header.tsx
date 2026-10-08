import Link from "next/link";
import { ArrowUpRight, Crown } from "lucide-react";
import type { StaffRole } from "../lib/staff";
import AdminNav from "./admin-nav";

export default function AdminHeader({
  showSections = true,
  role = "barbeiro",
  userLabel,
}: {
  showSections?: boolean;
  role?: StaffRole;
  userLabel?: string;
}) {
  // Barbeiro logado: painel dos barbeiros. Admin e telas sem sessão (login): painel da barbearia.
  const team = showSections && role === "barbeiro";

  return (
    <header className="admin-header">
      <div className="admin-header__inner">
        {/* Sem sessão (login, sem acesso) não há o que pré-carregar: o painel pediria login. */}
        <Link className="brand" href={team ? "/painel/equipe" : "/painel"} prefetch={showSections ? undefined : false}>
          <Crown aria-hidden="true" className="brand__icon" strokeWidth={1.6} />
          <span className="brand__name">
            <span>Black Crown</span>
            <span className="brand__descriptor">{team ? "Painel dos barbeiros" : "Painel da barbearia"}</span>
          </span>
        </Link>

        {showSections ? (
          <AdminNav role={role} userLabel={userLabel ?? ""} />
        ) : (
          <div className="admin-header__meta">
            <Link className="admin-header__site-link" href="/">
              Ver site
              <ArrowUpRight aria-hidden="true" size={14} />
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
