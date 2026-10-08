"use client";

import { useState } from "react";
import { CircleAlert, Clock3 } from "lucide-react";
import { DefaultServiceIcon, serviceIcons } from "../../../components/service-icons";
import {
  describeServiceConflict,
  findServiceConflicts,
  formatCurrency,
  getService,
  maxServicesPerBooking,
  replaceConflictingServices,
  type BookingService,
  type ServiceId,
} from "../../../data/booking";
import {
  describePlanBenefits,
  formatFrequency,
  getPlan,
  type SubscriptionPlan,
} from "../../../data/plans";
import { formatDuration } from "../../../data/services";
import { blockedMessages, type SubscriberSession } from "../../../data/subscribers";
import { useBookingPlans, useBookingServices } from "../booking-catalog";
import ChoiceCard from "../choice-card";

type ServiceStepProps = {
  /** Serviços escolhidos, na ordem da escolha. */
  selectedIds: readonly ServiceId[];
  onChange: (serviceIds: ServiceId[]) => void;
  /** Assinante logado: os serviços do plano aparecem primeiro. */
  session: SubscriberSession | null;
  /** A sessão do assinante ainda está sendo conferida. */
  loading: boolean;
};

/** Aviso aberto no cartão tocado: conflito com um combo ou limite de serviços. */
type Prompt = { serviceId: ServiceId; message: string; canReplace: boolean };

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
  const benefit = plan?.benefits.find((item) => item.serviceId === service.slug) ?? null;

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
          {benefit ? ` · ${formatFrequency(benefit)}` : null}
        </span>
        <strong>{benefit ? "Incluído" : formatCurrency(service.price)}</strong>
      </span>
    </ChoiceCard>
  );
}

function ServiceGrid({
  services,
  startIndex = 0,
  selectedIds,
  onSelect,
  prompt,
  onReplace,
  onKeep,
  plan,
}: {
  services: readonly BookingService[];
  startIndex?: number;
  selectedIds: readonly ServiceId[];
  onSelect: (serviceId: ServiceId) => void;
  prompt: Prompt | null;
  onReplace: () => void;
  onKeep: () => void;
  plan?: SubscriptionPlan;
}) {
  return (
    <ul className="choice-grid">
      {services.map((service, index) => {
        const open = prompt?.serviceId === service.slug ? prompt : null;
        return (
          <li className={open ? "has-prompt" : undefined} key={service.slug}>
            <ServiceCard
              index={startIndex + index}
              onSelect={() => onSelect(service.slug)}
              plan={plan}
              selected={selectedIds.includes(service.slug)}
              service={service}
            />
            {open ? (
              <div className="booking-alert service-conflict" role="status">
                <p>
                  <CircleAlert aria-hidden="true" size={16} />
                  <span>
                    <strong>{open.message}</strong>
                    {open.canReplace ? " Substituir?" : null}
                  </span>
                </p>
                <span className="service-conflict__actions">
                  {open.canReplace ? (
                    <button className="booking-text-button" onClick={onReplace} type="button">
                      Substituir
                    </button>
                  ) : null}
                  <button className="booking-text-button" onClick={onKeep} type="button">
                    {open.canReplace ? "Manter" : "Entendi"}
                  </button>
                </span>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export default function ServiceStep({ selectedIds, onChange, session, loading }: ServiceStepProps) {
  const bookingServices = useBookingServices();
  const plans = useBookingPlans();
  const [prompt, setPrompt] = useState<Prompt | null>(null);

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

  // Tocar num escolhido tira da lista; num novo, adiciona, a não ser que conflite com um combo.
  function toggle(serviceId: ServiceId) {
    setPrompt(null);
    if (selectedIds.includes(serviceId)) {
      onChange(selectedIds.filter((id) => id !== serviceId));
      return;
    }
    const service = getService(bookingServices, serviceId);
    if (!service) return;
    const conflicts = findServiceConflicts(bookingServices, selectedIds, serviceId);
    if (conflicts.length) {
      setPrompt({ serviceId, message: describeServiceConflict(service, conflicts), canReplace: true });
      return;
    }
    if (selectedIds.length >= maxServicesPerBooking) {
      setPrompt({
        serviceId,
        message: `Escolha até ${maxServicesPerBooking} serviços por agendamento.`,
        canReplace: false,
      });
      return;
    }
    onChange([...selectedIds, serviceId]);
  }

  function replace() {
    if (!prompt) return;
    onChange(replaceConflictingServices(bookingServices, selectedIds, prompt.serviceId));
    setPrompt(null);
  }

  const gridProps = {
    selectedIds,
    onSelect: toggle,
    prompt,
    onReplace: replace,
    onKeep: () => setPrompt(null),
  };

  const plan = getPlan(plans, session?.planId ?? null);

  if (!session || !plan) {
    return <ServiceGrid {...gridProps} services={bookingServices} />;
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
        <ServiceGrid {...gridProps} services={bookingServices} />
      </>
    );
  }

  const inPlan = (service: BookingService) => plan.benefits.some((benefit) => benefit.serviceId === service.slug);
  const included = bookingServices.filter(inPlan);
  const others = bookingServices.filter((service) => !inPlan(service));

  return (
    <>
      <section aria-labelledby="service-group-plan" className="service-group">
        <header className="service-group__header">
          <h3 id="service-group-plan">Serviços do seu plano</h3>
          <p>
            {plan.name}: {describePlanBenefits(plan, bookingServices)}.
          </p>
        </header>
        <ServiceGrid {...gridProps} plan={plan} services={included} />
      </section>

      {others.length ? (
        <section aria-labelledby="service-group-others" className="service-group">
          <header className="service-group__header">
            <h3 id="service-group-others">Serviços fora do plano</h3>
            <p>Valor avulso, pago na barbearia.</p>
          </header>
          <ServiceGrid {...gridProps} services={others} startIndex={included.length} />
        </section>
      ) : null}
    </>
  );
}
