import Link from "next/link";
import { ArrowLeft, CalendarCheck, Crown } from "lucide-react";

export default function BookingHeader() {
  return (
    <header className="booking-header">
      <div className="booking-header__inner">
        <Link className="brand" href="/">
          <Crown aria-hidden="true" className="brand__icon" strokeWidth={1.6} />
          <span className="brand__name">
            <span>Black Crown</span>
            <span className="brand__descriptor">Barber</span>
          </span>
        </Link>

        <div className="booking-header__meta">
          <span className="booking-header__tag">
            <CalendarCheck aria-hidden="true" size={15} strokeWidth={1.7} />
            Agendamento online
          </span>
          <Link className="booking-header__back" href="/">
            <ArrowLeft aria-hidden="true" size={15} />
            Voltar ao site
          </Link>
        </div>
      </div>
    </header>
  );
}
