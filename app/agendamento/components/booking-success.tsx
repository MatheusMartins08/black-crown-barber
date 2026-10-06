import Link from "next/link";
import type { Ref } from "react";
import { ArrowUpRight, CalendarPlus, Check, CalendarClock, CalendarX2, MessageCircle } from "lucide-react";
import { siteConfig } from "../../data/site";
import {
  formatCurrency,
  formatLongDate,
  getProfessional,
  getService,
  toMinutes,
  toTime,
  type Reservation,
} from "../../data/booking";
import { reservationActions, type ReservationActionId } from "../lib/booking-integrations";
import ProfessionalAvatar from "./professional-avatar";

const actionIcons: Record<ReservationActionId, typeof MessageCircle> = {
  whatsapp: MessageCircle,
  calendar: CalendarPlus,
  reschedule: CalendarClock,
  cancel: CalendarX2,
};

type BookingSuccessProps = {
  reservation: Reservation;
  onBookAnother: () => void;
  headingRef: Ref<HTMLHeadingElement>;
};

export default function BookingSuccess({ reservation, onBookAnother, headingRef }: BookingSuccessProps) {
  const service = getService(reservation.serviceId);
  const professional = getProfessional(reservation.professionalId);
  const endTime = toTime(toMinutes(reservation.time) + reservation.durationMinutes);

  const rows = [
    { label: "Serviço", value: service?.name },
    {
      label: "Profissional",
      value: (
        <span className="booking-review__person">
          <ProfessionalAvatar professionalId={reservation.professionalId} size={26} />
          <span>
            {professional?.name}
            {reservation.requestedAnyProfessional ? <small>Definido pelo primeiro horário livre</small> : null}
          </span>
        </span>
      ),
    },
    { label: "Data", value: formatLongDate(reservation.date) },
    { label: "Horário", value: `${reservation.time} às ${endTime}` },
    { label: "Duração", value: service?.duration },
    { label: "Local", value: `${siteConfig.address}, ${siteConfig.city}` },
    {
      label: reservation.plan ? "Assinante" : "Cliente",
      value: (
        <span className="booking-review__stack">
          {reservation.customer.name}
          <small>{reservation.customer.phone}</small>
          {reservation.customer.email ? <small>{reservation.customer.email}</small> : null}
          {reservation.plan ? <small>{reservation.plan.name}</small> : null}
        </span>
      ),
    },
  ];

  return (
    <section aria-labelledby="booking-success-title" className="booking-success">
      <span aria-hidden="true" className="booking-success__mark">
        <Check size={30} strokeWidth={2} />
      </span>
      <p className="section-heading__eyebrow">Agendamento confirmado</p>
      <h1 id="booking-success-title" ref={headingRef} tabIndex={-1}>
        Horário reservado.
      </h1>
      <p className="booking-success__lead">
        Tudo certo, {reservation.customer.name.split(" ")[0]}. Te esperamos {formatLongDate(reservation.date).toLowerCase()} às{" "}
        {reservation.time}. Chegue com alguns minutos de antecedência.
      </p>

      <p className="booking-success__code">
        Código da reserva <strong>{reservation.code}</strong>
      </p>

      <div className="booking-review booking-success__card">
        <dl className="booking-review__list">
          {rows.map((row) => (
            <div className="booking-review__row booking-review__row--static" key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
        <div className="booking-review__total">
          <span>Valor</span>
          <strong>
            {reservation.plan?.covered ? "Incluído no plano" : formatCurrency(reservation.price)}
          </strong>
        </div>
      </div>

      <div className="reservation-actions">
        <h2>Depois de agendar</h2>
        <ul>
          {reservationActions.map((action) => {
            const Icon = actionIcons[action.id];
            const content = (
              <>
                <span className="reservation-actions__icon">
                  <Icon aria-hidden="true" size={18} strokeWidth={1.6} />
                </span>
                <span className="reservation-actions__text">
                  <strong>{action.label}</strong>
                  <span>{action.description}</span>
                </span>
                {action.enabled ? (
                  <ArrowUpRight aria-hidden="true" className="reservation-actions__arrow" size={16} />
                ) : null}
              </>
            );

            return (
              <li key={action.id}>
                {action.enabled && action.getHref ? (
                  <a className="reservation-actions__item is-enabled" href={action.getHref(reservation)}>
                    {content}
                  </a>
                ) : (
                  <div className="reservation-actions__item">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="booking-success__footer">
        <Link className="button" href="/">
          Voltar ao site <ArrowUpRight aria-hidden="true" size={17} />
        </Link>
        <button className="booking-text-button" onClick={onBookAnother} type="button">
          Fazer outro agendamento
        </button>
      </div>
    </section>
  );
}
