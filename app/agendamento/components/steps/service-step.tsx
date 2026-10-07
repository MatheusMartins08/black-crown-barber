import { CircleAlert, Clock3 } from "lucide-react";
import { DefaultServiceIcon, serviceIcons } from "../../../components/service-icons";
import { formatCurrency, type BookingService, type ServiceId } from "../../../data/booking";
import {
  describePlanBenefits,
  formatPerWeek,
  getPlan,
  getPlanBenefit,
  type SubscriptionPlan,
} from "../../../data/plans";
import { formatDuration } from "../../../data/services";
import { blockedMessages, type SubscriberSession } from "../../../data/subscribers";
import { useBookingServices } from "../booking-catalog";
import ChoiceCard from "../choice-card";

type ServiceStepProps = {
  selectedId: ServiceId | null;
  onSelect: (serviceId: ServiceId) => void;
  /** Assinante logado: os serviços do plano aparecem primeiro. */
  session: SubscriberSession | null;
  /** A sessão do assinante ainda está sendo conferida. */
  loading: boolean;
};

function ServiceCard({
  service,
  index,
  selected,
  onSelect,
  plan,
}: {
  service: BookingService;
  index: number;
  selected: boolean;
  onSelect: () => void;
  /** Preenchido quando o serviço faz parte do plano do assinante. */
  plan?: SubscriptionPlan;
}) {
  const Icon = serviceIcons[service.icon] ?? DefaultServiceIcon;
  const benefit = plan ? getPlanBenefit(plan.id, service.slug) : null;

  return (
    <ChoiceCard
      className={`service-choice${benefit ? " service-choice--plan" : ""}`}
      index={index}
      onSelect={onSelect}
      selected={selected}
    >
      <span className="service-choice__topline">
        <span className="service-card__icon">
          <Icon aria-hidden="true" size={20} strokeWidth={1.6} />
        </span>
        {benefit ? (
          <span className="service-card__badge">Incluído no plano</span>
        ) : service.isPopular ? (
          <span className="service-card__badge">Mais pedido</span>
        ) : null}
      </span>
      <span className="choice-card__title">{service.name}</span>
      <span className="choice-card__description">{service.description}</span>
      <span className="service-choice__meta">
        <span>
          <Clock3 aria-hidden="true" size={14} strokeWidth={1.7} />
          {formatDuration(service.durationMinutes)}
          {benefit ? ` · ${formatPerWeek(benefit.perWeek)}` : null}
        </span>
        <strong>{benefit ? "Incluído" : formatCurrency(service.price)}</strong>
      </span>
    </ChoiceCard>
  );
}

function ServiceGrid({
  services,
  startIndex = 0,
  selectedId,
  onSelect,
  plan,
}: {
  services: readonly BookingService[];
  startIndex?: number;
  selectedId: ServiceId | null;
  onSelect: (serviceId: ServiceId) => void;
  plan?: SubscriptionPlan;
}) {
  return (
    <ul className="choice-grid">
      {services.map((service, index) => (
        <li key={service.slug}>
          <ServiceCard
            index={startIndex + index}
            onSelect={() => onSelect(service.slug)}
            plan={plan}
            selected={selectedId === service.slug}
            service={service}
          />
        </li>
      ))}
    </ul>
  );
}

export default function ServiceStep({ selectedId, onSelect, session, loading }: ServiceStepProps) {
  const bookingServices = useBookingServices();
  if (loading) {
    return (
      <ul aria-busy="true" aria-label="Carregando os serviços do seu plano" className="choice-grid">
        {bookingServices.map((service) => (
          <li key={service.slug}>
            <span className="choice-card service-choice booking-skeleton service-choice--skeleton" />
          </li>
        ))}
      </ul>
    );
  }

  const plan = getPlan(session?.planId ?? null);

  if (!session || !plan) {
    return <ServiceGrid onSelect={onSelect} selectedId={selectedId} services={bookingServices} />;
  }

  if (session.blockedReason) {
    const message = blockedMessages[session.blockedReason];
    return (
      <>
        <div className="booking-alert service-step__notice" role="status">
          <p>
            <CircleAlert aria-hidden="true" size={16} />
            <span>
              <strong>
                {message.title} · {plan.name}.
              </strong>{" "}
              Os benefícios do plano não estão liberados, então os serviços têm o valor avulso.
            </span>
          </p>
        </div>
        <ServiceGrid onSelect={onSelect} selectedId={selectedId} services={bookingServices} />
      </>
    );
  }

  const included = bookingServices.filter((service) => getPlanBenefit(plan.id, service.slug));
  const others = bookingServices.filter((service) => !getPlanBenefit(plan.id, service.slug));

  return (
    <>
      <section aria-labelledby="service-group-plan" className="service-group">
        <header className="service-group__header">
          <h3 id="service-group-plan">Serviços do seu plano</h3>
          <p>
            {plan.name}: {describePlanBenefits(plan.id, bookingServices)}.
          </p>
        </header>
        <ServiceGrid onSelect={onSelect} plan={plan} selectedId={selectedId} services={included} />
      </section>

      {others.length ? (
        <section aria-labelledby="service-group-others" className="service-group">
          <header className="service-group__header">
            <h3 id="service-group-others">Serviços fora do plano</h3>
            <p>Valor avulso, pago na barbearia.</p>
          </header>
          <ServiceGrid
            onSelect={onSelect}
            selectedId={selectedId}
            services={others}
            startIndex={included.length}
          />
        </section>
      ) : null}
    </>
  );
}
