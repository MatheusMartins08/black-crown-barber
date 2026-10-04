import Image from "next/image";
import { Crown } from "lucide-react";
import {
  ANY_PROFESSIONAL,
  getProfessionalsForService,
  type ProfessionalChoice,
  type ServiceId,
} from "../../../data/booking";
import ChoiceCard from "../choice-card";

type ProfessionalStepProps = {
  serviceId: ServiceId;
  selectedId: ProfessionalChoice | null;
  onSelect: (professionalId: ProfessionalChoice) => void;
};

export default function ProfessionalStep({ serviceId, selectedId, onSelect }: ProfessionalStepProps) {
  const professionals = getProfessionalsForService(serviceId);

  return (
    <ul className="choice-grid choice-grid--professionals">
      <li>
        <ChoiceCard
          className="professional-choice"
          onSelect={() => onSelect(ANY_PROFESSIONAL)}
          selected={selectedId === ANY_PROFESSIONAL}
        >
          <span className="professional-choice__media professional-choice__media--any">
            <span className="professional-choice__mark">
              <Crown aria-hidden="true" size={24} strokeWidth={1.5} />
            </span>
          </span>
          <span className="professional-choice__body">
            <span className="choice-card__eyebrow">Sem preferência</span>
            <span className="choice-card__title">Qualquer profissional</span>
            <span className="choice-card__description">
              Mostramos o primeiro horário livre entre toda a equipe.
            </span>
          </span>
        </ChoiceCard>
      </li>

      {professionals.map((professional, index) => (
        <li key={professional.id}>
          <ChoiceCard
            className="professional-choice"
            index={index + 1}
            onSelect={() => onSelect(professional.id)}
            selected={selectedId === professional.id}
          >
            <span className="professional-choice__media">
              <Image
                alt=""
                className="professional-choice__image"
                fill
                sizes="(max-width: 700px) 104px, (max-width: 1000px) 45vw, 360px"
                src={professional.image}
                style={{ objectPosition: professional.imagePosition }}
              />
            </span>
            <span className="professional-choice__body">
              <span className="choice-card__eyebrow">{professional.specialty}</span>
              <span className="choice-card__title">{professional.name}</span>
            </span>
          </ChoiceCard>
        </li>
      ))}
    </ul>
  );
}
