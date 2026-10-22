import Link from "next/link";
import { AtSign, Crown, MapPin, Phone } from "lucide-react";
import { getWeekSchedule, type OpeningPeriod } from "../data/hours";
import { footerNavigationItems, type SiteConfig } from "../data/site";

/** `periods`: horário semanal do Supabase; o rodapé lista só os dias abertos. */
export default function SiteFooter({ periods, site }: { periods: OpeningPeriod[]; site: SiteConfig }) {
  return (
    <footer className="site-footer">
      <div className="site-footer__main">
        <div className="site-footer__brand-column">
          <Link className="brand" href="#inicio">
            <Crown aria-hidden="true" className="brand__icon" strokeWidth={1.6} />
            <span className="brand__name">
              <span>{site.brand.main}</span>
              <span className="brand__descriptor">{site.brand.descriptor}</span>
            </span>
          </Link>
          <p>Barbearia de estilo clássico e contemporâneo.</p>
        </div>

        <nav aria-label="Links do rodapé" className="site-footer__nav">
          <h2>Explore</h2>
          {footerNavigationItems.map((item) => (
            <Link href={item.href} key={item.href}>{item.label}</Link>
          ))}
        </nav>

        <div className="site-footer__contact">
          <h2>Contato</h2>
          <p><Phone aria-hidden="true" size={15} />{site.phone}</p>
          <p><AtSign aria-hidden="true" size={15} />{site.instagram}</p>
          <p><MapPin aria-hidden="true" size={15} />{site.address}, {site.city}</p>
        </div>

        <div className="site-footer__hours">
          <h2>Horários</h2>
          {getWeekSchedule(periods)
            .filter((item) => item.open)
            .map((item) => (
            <p key={item.day}><span>{item.day.replace("-feira", "")}</span><span>{item.hours}</span></p>
          ))}
        </div>
      </div>
      <div className="site-footer__bottom">
        <span>© {new Date().getFullYear()} {site.name}. Todos os direitos reservados.</span>
      </div>
    </footer>
  );
}