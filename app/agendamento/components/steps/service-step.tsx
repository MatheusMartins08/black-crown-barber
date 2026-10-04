import { Clock3 } from "lucide-react";
import { serviceIcons } from "../../../components/service-icons";
import { bookingServices, formatCurrency, type ServiceId } from "../../../data/booking";
import ChoiceCard from "../choice-card";

type ServiceStepProps = {
  selectedId: ServiceId | null;
  onSelect: (serviceId: ServiceId) => void;
};

export default function ServiceStep({ selectedId, onSelect }: ServiceStepProps) {
  return (
    <ul className="choice-grid">
      {bookingServices.map((service, index) => {
        const Icon = serviceIcons[service.icon];
        const isPopular = "popular" in service && service.popular;

        return (
          <li key={service.id}>
            <ChoiceCard
              className="service-choice"
              index={index}
              onSelect={() => onSelect(service.id)}
              selected={selectedId === service.id}
            >
              <span className="service-choice__topline">
                <span className="service-card__icon">
                  <Icon aria-hidden="true" size={20} strokeWidth={1.6} />
                </span>
                {isPopular ? <span className="service-card__badge">Mais pedido</span> : null}
              </span>
              <span className="choice-card__title">{service.name}</span>
              <span className="choice-card__description">{service.description}</span>
              <span className="service-choice__meta">
                <span>
                  <Clock3 aria-hidden="true" size={14} strokeWidth={1.7} />
                  {service.duration}
                </span>
                <strong>{formatCurrency(service.price)}</strong>
              </span>
            </ChoiceCard>
          </li>
        );
      })}
    </ul>
  );
}
