import Link from "next/link";
import { AtSign, Crown, MapPin, Phone } from "lucide-react";
import { footerNavigationItems, openingHours, siteConfig } from "../data/site";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__main">
        <div className="site-footer__brand-column">
          <Link className="brand" href="#inicio">
            <Crown aria-hidden="true" className="brand__icon" strokeWidth={1.6} />
            <span className="brand__name">
              <span>Black Crown</span>
              <span className="brand__descriptor">Barber</span>
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
          <p><Phone aria-hidden="true" size={15} />{siteConfig.phone}</p>
          <p><AtSign aria-hidden="true" size={15} />{siteConfig.instagram}</p>
          <p><MapPin aria-hidden="true" size={15} />{siteConfig.address}, {siteConfig.city}</p>
        </div>

        <div className="site-footer__hours">
          <h2>Horários</h2>
          {openingHours.slice(0, 6).map((item) => (
            <p key={item.day}><span>{item.day.replace("-feira", "")}</span><span>{item.hours}</span></p>
          ))}
        </div>
      </div>
      <div className="site-footer__bottom">
        <span>© {new Date().getFullYear()} {siteConfig.name}. Todos os direitos reservados.</span>
      </div>
    </footer>
  );
}