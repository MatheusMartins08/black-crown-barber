"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft } from "lucide-react";
import {
  ANY_PROFESSIONAL,
  getProfessional,
  getService,
  hasErrors,
  validateCustomer,
  type ProfessionalChoice,
  type Reservation,
  type ServiceId,
  type TimeSlot,
} from "../../data/booking";
import { BookingApiError, createReservation } from "../lib/booking-api";
import BookingProgress from "./booking-progress";
import BookingSuccess from "./booking-success";
import { BookingSummaryBar, BookingSummaryPanel } from "./booking-summary";
import PrimaryActionButton, { type PrimaryAction } from "./primary-action-button";
import DetailsStep, { getFieldId } from "./steps/details-step";
import ProfessionalStep from "./steps/professional-step";
import ReviewStep from "./steps/review-step";
import ScheduleStep from "./steps/schedule-step";
import ServiceStep from "./steps/service-step";
import useBookingDraft, {
  bookingSteps,
  getMaxReachableStep,
  hasStoredDraft,
  type StepIndex,
} from "./use-booking-draft";

type BookingFlowProps = {
  initialServiceId: ServiceId | null;
  initialProfessionalId: ProfessionalChoice | null;
};

const autoAdvanceDelay = 220;
const subscribeToNothing = () => () => {};

/**
 * No servidor (e durante a hidratação) o fluxo começa limpo. No cliente, se houver um
 * rascunho salvo nesta aba, o conteúdo é remontado já com as escolhas restauradas.
 */
export default function BookingFlow(props: BookingFlowProps) {
  const mode = useSyncExternalStore(
    subscribeToNothing,
    () => (hasStoredDraft() ? "restored" : "fresh"),
    () => "server",
  );

  return (
    <BookingFlowContent
      key={mode === "restored" ? "restored" : "initial"}
      {...props}
      persist={mode !== "server"}
      restore={mode === "restored"}
    />
  );
}

function getStepCopy(step: StepIndex, serviceName: string | undefined, professionalName: string | undefined) {
  switch (step) {
    case 0:
      return {
        title: "Qual serviço você quer fazer?",
        description: "Escolha um serviço. Dá para alterar a escolha a qualquer momento.",
      };
    case 1:
      return {
        title: "Com quem você quer agendar?",
        description: "Escolha um profissional ou deixe que a gente encontre o primeiro horário livre.",
      };
    case 2:
      return {
        title: "Escolha o dia e o horário",
        description: `Apenas horários disponíveis para ${serviceName?.toLowerCase() ?? "o serviço"}${
          professionalName ? ` com ${professionalName}` : " com qualquer profissional"
        }.`,
      };
    case 3:
      return { title: "Seus dados", description: "Só o necessário para confirmar o seu horário." };
    case 4:
      return {
        title: "Revise e confirme",
        description: "Confira os detalhes. Use “Alterar” para ajustar qualquer escolha.",
      };
  }
}

const stepHints: Partial<Record<StepIndex, string>> = {
  0: "Escolha um serviço para continuar.",
  1: "Escolha um profissional para continuar.",
  2: "Escolha um horário para continuar.",
};

type SubmissionError = { message: string; canPickAnotherTime: boolean };

function BookingFlowContent({
  initialServiceId,
  initialProfessionalId,
  restore,
  persist,
}: BookingFlowProps & { restore: boolean; persist: boolean }) {
  const [{ step, draft }, dispatch] = useBookingDraft({ initialServiceId, initialProfessionalId, restore, persist });
  const [detailsAttempted, setDetailsAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<SubmissionError | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);

  const flowRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const advanceTimer = useRef<number | undefined>(undefined);
  const previousView = useRef<string>(`step-${step}`);

  const maxReachable = getMaxReachableStep(draft);
  const service = getService(draft.serviceId);
  const professionalName =
    draft.professionalId && draft.professionalId !== ANY_PROFESSIONAL
      ? getProfessional(draft.professionalId)?.name
      : undefined;
  const copy = getStepCopy(step, service?.name, professionalName);

  const goTo = useCallback(
    (target: StepIndex) => {
      window.clearTimeout(advanceTimer.current);
      setSubmissionError(null);
      dispatch({ type: "goTo", step: target });
    },
    [dispatch],
  );

  const advanceAfterSelection = useCallback(
    (target: StepIndex) => {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = window.setTimeout(() => dispatch({ type: "goTo", step: target }), autoAdvanceDelay);
    },
    [dispatch],
  );

  useEffect(() => () => window.clearTimeout(advanceTimer.current), []);

  // Ao trocar de etapa: leva o topo do fluxo para a tela e move o foco para o título.
  const view = reservation ? "success" : `step-${step}`;
  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;

    const heading = reservation ? successHeadingRef.current : stepHeadingRef.current;
    const anchor = reservation ? heading : flowRef.current;
    const headerHeight = document.querySelector(".booking-header")?.getBoundingClientRect().height ?? 0;

    if (anchor) {
      const top = anchor.getBoundingClientRect().top + window.scrollY - headerHeight - 20;
      if (window.scrollY > top || reservation) {
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion ? "auto" : "smooth" });
      }
    }
    heading?.focus({ preventScroll: true });
  }, [view, reservation]);

  const handleSlotsLoaded = useCallback(
    (date: string, slots: TimeSlot[]) => dispatch({ type: "syncSlots", date, slots }),
    [dispatch],
  );

  function submitDetails() {
    setDetailsAttempted(true);
    const errors = validateCustomer(draft.customer);
    if (!hasErrors(errors)) {
      goTo(4);
      return;
    }
    const firstInvalid = (["name", "phone", "email", "notes"] as const).find((field) => errors[field]);
    if (firstInvalid) document.getElementById(getFieldId(firstInvalid))?.focus();
  }

  async function confirmReservation() {
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      const created = await createReservation(draft);
      setReservation(created);
      // Mantém os dados de contato para um próximo agendamento; limpa as escolhas.
      dispatch({ type: "reset" });
      setDetailsAttempted(false);
    } catch (error) {
      setSubmissionError(
        error instanceof BookingApiError
          ? { message: error.message, canPickAnotherTime: error.reason === "slot_unavailable" }
          : { message: "Não foi possível confirmar agora. Tente novamente em instantes.", canPickAnotherTime: false },
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const isPrimaryDisabled = step === 4 ? maxReachable < 4 : step < 3 && maxReachable <= step;
  const primaryHint = isPrimaryDisabled ? stepHints[step] : undefined;
  const primaryAction: PrimaryAction =
    step === 4
      ? {
          label: "Confirmar agendamento",
          shortLabel: "Confirmar",
          onClick: confirmReservation,
          disabled: isPrimaryDisabled,
          loading: isSubmitting,
          loadingLabel: "Confirmando…",
        }
      : step === 3
        ? { label: "Revisar agendamento", shortLabel: "Revisar", onClick: submitDetails, disabled: false }
        : { label: "Continuar", onClick: () => goTo((step + 1) as StepIndex), disabled: isPrimaryDisabled };

  if (reservation) {
    return (
      <div className="booking-flow" ref={flowRef}>
        <BookingSuccess
          headingRef={successHeadingRef}
          onBookAnother={() => setReservation(null)}
          reservation={reservation}
        />
      </div>
    );
  }

  return (
    <div className="booking-flow">
      <header className="booking-intro">
        <p className="section-heading__eyebrow">Agendamento online</p>
        <h1>Reserve seu horário.</h1>
        <p>Cinco passos rápidos, sem cadastro. Escolha o serviço, o profissional e o melhor horário para você.</p>
      </header>

      <div className="booking-flow__progress" ref={flowRef}>
        <BookingProgress current={step} maxReachable={maxReachable} onSelect={goTo} />
      </div>

      <p aria-live="polite" className="sr-only">
        Etapa {step + 1} de {bookingSteps.length}: {bookingSteps[step]}
      </p>

      <div className="booking-flow__layout">
        <section aria-labelledby="booking-step-title" className="booking-step" key={step}>
          <header className="booking-step__header">
            <p className="booking-step__count">
              Etapa {step + 1} de {bookingSteps.length}
            </p>
            <h2 id="booking-step-title" ref={stepHeadingRef} tabIndex={-1}>
              {copy.title}
            </h2>
            <p>{copy.description}</p>
          </header>

          {step === 0 ? (
            <ServiceStep
              onSelect={(serviceId) => {
                dispatch({ type: "selectService", serviceId });
                advanceAfterSelection(1);
              }}
              selectedId={draft.serviceId}
            />
          ) : null}

          {step === 1 && draft.serviceId ? (
            <ProfessionalStep
              onSelect={(professionalId) => {
                dispatch({ type: "selectProfessional", professionalId });
                advanceAfterSelection(2);
              }}
              selectedId={draft.professionalId}
              serviceId={draft.serviceId}
            />
          ) : null}

          {step === 2 && draft.serviceId && draft.professionalId ? (
            <ScheduleStep
              assignedProfessionalId={draft.assignedProfessionalId}
              date={draft.date}
              onChangeProfessional={() => goTo(1)}
              onSelectDate={(date) => dispatch({ type: "selectDate", date })}
              onSelectSlot={(date, slot) => dispatch({ type: "selectSlot", date, slot })}
              onSlotsLoaded={handleSlotsLoaded}
              onUseAnyProfessional={() => dispatch({ type: "selectProfessional", professionalId: ANY_PROFESSIONAL })}
              professionalId={draft.professionalId}
              serviceId={draft.serviceId}
              time={draft.time}
            />
          ) : null}

          {step === 3 ? (
            <DetailsStep
              customer={draft.customer}
              onChange={(changes) => dispatch({ type: "updateCustomer", changes })}
              onSubmit={submitDetails}
              showAllErrors={detailsAttempted}
            />
          ) : null}

          {step === 4 ? <ReviewStep draft={draft} error={submissionError} onEdit={goTo} /> : null}

          <footer className={`booking-step__footer${step === 0 ? " booking-step__footer--first" : ""}`}>
            {step > 0 ? (
              <button className="booking-back" onClick={() => goTo((step - 1) as StepIndex)} type="button">
                <ArrowLeft aria-hidden="true" size={16} />
                Voltar
              </button>
            ) : null}
            <div className="booking-step__actions">
              {primaryHint ? <p className="booking-step__hint">{primaryHint}</p> : null}
              <PrimaryActionButton action={primaryAction} />
            </div>
          </footer>
        </section>

        <BookingSummaryPanel draft={draft} />
      </div>

      <BookingSummaryBar action={primaryAction} draft={draft} />
    </div>
  );
}
