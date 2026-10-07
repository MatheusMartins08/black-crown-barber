import { CalendarCheck, CircleAlert, Crown, LogOut } from "lucide-react";
import type { CustomerType } from "../../../data/booking";
import { getPlan } from "../../../data/plans";
import { blockedMessages, type SubscriberSession } from "../../../data/subscribers";
import { useBookingPlans } from "../booking-catalog";
import ChoiceCard from "../choice-card";

type ProfileStepProps = {
  customerType: CustomerType | null;
  session: SubscriberSession | null;
  /** Aviso quando uma sessão de assinante deixou de valer. */
  notice: string | null;
  onChooseSubscriber: () => void;
  onChooseGuest: () => void;
  onSignOut: () => void;
};

export default function ProfileStep({
  customerType,
  session,
  notice,
  onChooseSubscriber,
  onChooseGuest,
  onSignOut,
}: ProfileStepProps) {
  const plan = getPlan(useBookingPlans(), session?.planId ?? null);
  const subscriberSelected = customerType === "assinante" && session !== null;

  return (
    <div className="profile-step">
      {notice ? (
        <div className="booking-alert profile-step__notice" role="status">
          <p>
            <CircleAlert aria-hidden="true" size={16} />
            <strong>{notice}</strong>
          </p>
        </div>
      ) : null}

      <ul className="choice-grid">
        <li>
          <ChoiceCard className="profile-choice" onSelect={onChooseSubscriber} selected={subscriberSelected}>
            <span className="service-choice__topline">
              <span className="service-card__icon">
                <Crown aria-hidden="true" size={20} strokeWidth={1.6} />
              </span>
            </span>
            <span className="choice-card__title">Sou assinante</span>
            <span className="choice-card__description">
              {session
                ? `Conectado como ${session.name}.`
                : "Entre com o telefone cadastrado na barbearia para usar os benefícios do seu plano."}
            </span>
            <span className="profile-choice__meta">
              {session && plan
                ? session.blockedReason
                  ? `${plan.name} · ${blockedMessages[session.blockedReason].title.toLowerCase()}`
                  : `${plan.name} · assinatura ativa`
                : "Telefone e senha"}
            </span>
          </ChoiceCard>
        </li>
        <li>
          <ChoiceCard
            className="profile-choice"
            index={1}
            onSelect={onChooseGuest}
            selected={customerType === "avulso"}
          >
            <span className="service-choice__topline">
              <span className="service-card__icon">
                <CalendarCheck aria-hidden="true" size={20} strokeWidth={1.6} />
              </span>
            </span>
            <span className="choice-card__title">Não sou assinante</span>
            <span className="choice-card__description">
              Agende normalmente. Você informa nome e telefone antes de confirmar.
            </span>
            <span className="profile-choice__meta">Sem cadastro</span>
          </ChoiceCard>
        </li>
      </ul>

      {session ? (
        <button className="booking-text-button profile-step__sign-out" onClick={onSignOut} type="button">
          <LogOut aria-hidden="true" size={14} />
          Sair da conta de assinante
        </button>
      ) : null}
    </div>
  );
}
