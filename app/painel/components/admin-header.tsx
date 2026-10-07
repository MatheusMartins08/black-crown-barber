import Link from "next/link";
import { ArrowUpRight, Crown } from "lucide-react";
import AdminNav from "./admin-nav";

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
          <AdminNav userLabel={userLabel ?? ""} />
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
