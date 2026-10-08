"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Info } from "lucide-react";
import useAsyncData from "../../components/use-async-data";
import {
  ANY_PROFESSIONAL,
  describeServices,
  getProfessional,
  getServices,
  getTodayIso,
  hasErrors,
  validateCustomer,
  type ProfessionalChoice,
  type Reservation,
  type ServiceId,
  type TimeSlot,
} from "../../data/booking";
import { getPlan, type SubscriptionPlan } from "../../data/plans";
import { evaluateCoverage, type SubscriberSession } from "../../data/subscribers";
import { fetchPlanCoverage } from "../../lib/subscribers-api";
import { BookingApiError, createReservation, createSubscriberReservation } from "../lib/booking-api";
import type { CoverageMap } from "../lib/plan-pricing";
import { useBookingPlans, useBookingProfessionals, useBookingServices } from "./booking-catalog";
import BookingProgress from "./booking-progress";
import BookingSuccess from "./booking-success";
import { BookingSummaryBar, BookingSummaryPanel } from "./booking-summary";
import PrimaryActionButton, { type PrimaryAction } from "./primary-action-button";
import DetailsStep, { getFieldId } from "./steps/details-step";
import ProfessionalStep from "./steps/professional-step";
import ProfileStep from "./steps/profile-step";
import ReviewStep from "./steps/review-step";
import ScheduleStep from "./steps/schedule-step";
import ServiceStep from "./steps/service-step";
import SubscriberLoginDialog from "./subscriber-login-dialog";
import useBookingDraft, {
  getBookingSteps,
  getMaxReachableStep,
  hasStoredDraft,
  stepLabels,
  type StepId,
} from "./use-booking-draft";
import useSubscriberSession from "./use-subscriber-session";

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

type CopyContext = {
  /** "Corte masculino + Sobrancelha". */
  serviceName?: string;
  professionalName?: string;
  session: SubscriberSession | null;
  plans: readonly SubscriptionPlan[];
};

function getStepCopy(step: StepId, { serviceName, professionalName, session, plans }: CopyContext) {
  switch (step) {
    case "perfil":
      return {
        title: "Você é assinante de algum plano?",
        description: "Assinantes entram com o telefone cadastrado na barbearia e usam os benefícios do plano.",
      };
    case "servico": {
      const planName = getPlan(plans, session?.planId ?? null)?.name;
      return {
        title: "Quais serviços você quer fazer?",
        description:
          planName && !session?.blockedReason
            ? `Os serviços do ${planName} aparecem primeiro. Escolha um ou mais; dá para alterar a qualquer momento.`
            : "Escolha um ou mais serviços para o mesmo horário. Dá para alterar a qualquer momento.",
      };
    }
    case "profissional":
      return {
        title: "Com quem você quer agendar?",
        description: "Escolha um profissional ou deixe que a gente encontre o primeiro horário livre.",
      };
    case "horario":
      return {
        title: "Escolha o dia e o horário",
        description: `Apenas horários disponíveis para ${serviceName?.toLowerCase() ?? "o serviço"}${
          professionalName ? ` com ${professionalName}` : " com qualquer profissional"
        }.`,
      };
    case "dados":
      return { title: "Seus dados", description: "Só o necessário para confirmar o seu horário." };
    case "confirmacao":
      return {
        title: "Revise e confirme",
        description: "Confira os detalhes. Use “Alterar” para ajustar qualquer escolha.",
      };
  }
}

const stepHints: Partial<Record<StepId, string>> = {
  perfil: "Responda para continuar.",
  servico: "Escolha ao menos um serviço para continuar.",
  profissional: "Escolha um profissional para continuar.",
  horario: "Escolha um horário para continuar.",
};

type SubmissionError = { message: string; canPickAnotherTime: boolean };

function BookingFlowContent({
  initialServiceId,
  initialProfessionalId,
  restore,
  persist,
}: BookingFlowProps & { restore: boolean; persist: boolean }) {
  const professionals = useBookingProfessionals();
  const services = useBookingServices();
  const plans = useBookingPlans();
  const [{ step, draft }, dispatch] = useBookingDraft({
    professionals,
    services,
    initialServiceId,
    initialProfessionalId,
    restore,
    persist,
  });
  const [detailsAttempted, setDetailsAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<SubmissionError | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginKey, setLoginKey] = useState(0);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  // Os serviços mudaram depois de escolher o horário: a duração mudou e é preciso escolher de novo.
  const [servicesChanged, setServicesChanged] = useState(false);

  const flowRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const advanceTimer = useRef<number | undefined>(undefined);
  const previousView = useRef<string>(`step-${step}`);
  const customerTypeRef = useRef(draft.customerType);

  useEffect(() => {
    customerTypeRef.current = draft.customerType;
  });

  // Rascunho de assinante sem sessão válida (saiu em outra aba, conta removida): volta ao Perfil.
  const subscriber = useSubscriberSession(() => {
    if (customerTypeRef.current !== "assinante") return;
    dispatch({ type: "setCustomerType", customerType: null });
    setSessionNotice("Sua sessão de assinante terminou. Entre de novo para usar os benefícios do plano.");
  });
  const session = draft.customerType === "assinante" ? subscriber.session : null;
  const sessionPending = draft.customerType === "assinante" && subscriber.status === "loading";

  const steps = getBookingSteps(draft.customerType);
  const stepIndex = steps.indexOf(step);
  const maxReachable = getMaxReachableStep(draft);
  const maxIndex = steps.indexOf(maxReachable);
  const selectedServices = getServices(services, draft.serviceIds);
  const professionalName =
    draft.professionalId && draft.professionalId !== ANY_PROFESSIONAL
      ? getProfessional(professionals, draft.professionalId)?.name
      : undefined;
  const copy = getStepCopy(step, {
    serviceName: selectedServices.length ? describeServices(selectedServices) : undefined,
    professionalName,
    session,
    plans,
  });

  // Cobertura do plano, serviço a serviço: confirmada no adaptador quando há data (limite do
  // período); antes disso, uma prévia pelo catálogo do plano.
  const serviceKey = draft.serviceIds.join(",");
  const coverageLoader = useMemo(
    () =>
      session && serviceKey && draft.date
        ? async () => {
            const ids = serviceKey.split(",");
            const date = draft.date!;
            const results = await Promise.all(ids.map((serviceId) => fetchPlanCoverage({ serviceId, date })));
            return Object.fromEntries(ids.map((id, index) => [id, results[index]])) as CoverageMap;
          }
        : null,
    // A situação e o plano entram na chave para reconsultar quando a conta muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session?.subscriberId, session?.planId, session?.status, serviceKey, draft.date],
  );
  const coverageResult = useAsyncData(coverageLoader);
  const coverage: CoverageMap =
    coverageResult.status === "success"
      ? coverageResult.data
      : session
        ? Object.fromEntries(
            draft.serviceIds.map((id) => [id, evaluateCoverage(plans, session, id, draft.date ?? getTodayIso(), 0)]),
          )
        : {};
  const checkingCoverage = coverageLoader !== null && coverageResult.status === "loading";
  const planInfo = { session, coverage };

  const goTo = useCallback(
    (target: StepId) => {
      window.clearTimeout(advanceTimer.current);
      setSubmissionError(null);
      dispatch({ type: "goTo", step: target });
    },
    [dispatch],
  );

  const advanceAfterSelection = useCallback(
    (target: StepId) => {
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

  function chooseGuest() {
    setSessionNotice(null);
    if (subscriber.session) void subscriber.signOut();
    dispatch({ type: "setCustomerType", customerType: "avulso" });
    advanceAfterSelection("servico");
  }

  function chooseSubscriber() {
    setSessionNotice(null);
    if (subscriber.session) {
      dispatch({ type: "setCustomerType", customerType: "assinante" });
      advanceAfterSelection("servico");
      return;
    }
    setLoginKey((key) => key + 1);
    setLoginOpen(true);
  }

  // Login concluído (com ou sem benefícios): segue como assinante, sem pedir dados.
  function continueAsSubscriber() {
    setLoginOpen(false);
    dispatch({ type: "setCustomerType", customerType: "assinante" });
    // Espera o modal fechar para o foco ir ao título da próxima etapa.
    advanceAfterSelection("servico");
  }

  async function signOut() {
    setLoginOpen(false);
    await subscriber.signOut();
    dispatch({ type: "setCustomerType", customerType: null });
  }

  function submitDetails() {
    setDetailsAttempted(true);
    const errors = validateCustomer(draft.customer);
    if (!hasErrors(errors)) {
      goTo("confirmacao");
      return;
    }
    const firstInvalid = (["name", "phone", "email"] as const).find((field) => errors[field]);
    if (firstInvalid) document.getElementById(getFieldId(firstInvalid))?.focus();
  }

  async function confirmReservation() {
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      const created =
        draft.customerType === "assinante" ? await createSubscriberReservation(draft) : await createReservation(draft);
      setReservation(created);
      // Mantém quem é o cliente e os dados de contato para um próximo agendamento; limpa as escolhas.
      dispatch({ type: "reset" });
      setServicesChanged(false);
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

  const isPrimaryDisabled =
    step === "confirmacao"
      ? maxIndex < stepIndex || checkingCoverage || sessionPending
      : step !== "dados" && maxIndex <= stepIndex;
  const primaryHint = isPrimaryDisabled ? stepHints[step] : undefined;
  const primaryAction: PrimaryAction =
    step === "confirmacao"
      ? {
          label: "Confirmar agendamento",
          shortLabel: "Confirmar",
          onClick: confirmReservation,
          disabled: isPrimaryDisabled,
          loading: isSubmitting,
          loadingLabel: "Confirmando…",
        }
      : step === "dados"
        ? { label: "Revisar agendamento", shortLabel: "Revisar", onClick: submitDetails, disabled: false }
        : { label: "Continuar", onClick: () => goTo(steps[stepIndex + 1]), disabled: isPrimaryDisabled };

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
        <p>
          Poucos passos, sem cadastro. Escolha o serviço, o profissional e o melhor horário para você. Assinantes entram
          com o telefone cadastrado na barbearia.
        </p>
      </header>

      <div className="booking-flow__progress" ref={flowRef}>
        <BookingProgress current={step} maxReachable={maxReachable} onSelect={goTo} steps={steps} />
      </div>

      <p aria-live="polite" className="sr-only">
        Etapa {stepIndex + 1} de {steps.length}: {stepLabels[step]}
      </p>

      <div className="booking-flow__layout">
        <section aria-labelledby="booking-step-title" className="booking-step" key={step}>
          <header className="booking-step__header">
            <p className="booking-step__count">
              Etapa {stepIndex + 1} de {steps.length}
            </p>
            <h2 id="booking-step-title" ref={stepHeadingRef} tabIndex={-1}>
              {copy.title}
            </h2>
            <p>{copy.description}</p>
          </header>

          {step === "perfil" ? (
            <ProfileStep
              customerType={draft.customerType}
              notice={sessionNotice}
              onChooseGuest={chooseGuest}
              onChooseSubscriber={chooseSubscriber}
              onSignOut={signOut}
              session={subscriber.session}
            />
          ) : null}

          {servicesChanged && (step === "servico" || step === "horario") ? (
            <div className="booking-alert service-step__notice" role="status">
              <p>
                <Info aria-hidden="true" size={16} />
                <span>
                  <strong>Os serviços mudaram, e a duração também.</strong> Escolha o horário de novo.
                </span>
              </p>
            </div>
          ) : null}

          {step === "servico" ? (
            <ServiceStep
              loading={sessionPending}
              onChange={(serviceIds) => {
                // Sem avanço automático: dá para escolher mais de um serviço antes de continuar.
                if (draft.time) setServicesChanged(true);
                setSubmissionError(null);
                dispatch({ type: "setServices", serviceIds });
              }}
              selectedIds={draft.serviceIds}
              session={session}
            />
          ) : null}

          {step === "profissional" && draft.serviceIds.length ? (
            <ProfessionalStep
              onSelect={(professionalId) => {
                dispatch({ type: "selectProfessional", professionalId });
                advanceAfterSelection("horario");
              }}
              selectedId={draft.professionalId}
              serviceIds={draft.serviceIds}
            />
          ) : null}

          {step === "horario" && draft.serviceIds.length && draft.professionalId ? (
            <ScheduleStep
              assignedProfessionalId={draft.assignedProfessionalId}
              date={draft.date}
              onChangeProfessional={() => goTo("profissional")}
              onSelectDate={(date) => dispatch({ type: "selectDate", date })}
              onSelectSlot={(date, slot) => {
                setServicesChanged(false);
                dispatch({ type: "selectSlot", date, slot });
              }}
              onSlotsLoaded={handleSlotsLoaded}
              onUseAnyProfessional={() => dispatch({ type: "selectProfessional", professionalId: ANY_PROFESSIONAL })}
              professionalId={draft.professionalId}
              serviceIds={draft.serviceIds}
              time={draft.time}
            />
          ) : null}

          {step === "dados" ? (
            <DetailsStep
              customer={draft.customer}
              onChange={(changes) => dispatch({ type: "updateCustomer", changes })}
              onSubmit={submitDetails}
              showAllErrors={detailsAttempted}
            />
          ) : null}

          {step === "confirmacao" && sessionPending ? (
            <div aria-busy="true" aria-label="Carregando os dados da sua conta" className="booking-skeleton booking-review--loading" />
          ) : null}

          {step === "confirmacao" && !sessionPending ? (
            <ReviewStep
              checkingCoverage={checkingCoverage}
              coverage={coverage}
              draft={draft}
              error={submissionError}
              onEdit={goTo}
              session={session}
            />
          ) : null}

          <footer className={`booking-step__footer${stepIndex === 0 ? " booking-step__footer--first" : ""}`}>
            {stepIndex > 0 ? (
              <button className="booking-back" onClick={() => goTo(steps[stepIndex - 1])} type="button">
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

        <BookingSummaryPanel draft={draft} planInfo={planInfo} />
      </div>

      <BookingSummaryBar action={primaryAction} draft={draft} planInfo={planInfo} />

      <SubscriberLoginDialog
        onClose={() => setLoginOpen(false)}
        onContinue={continueAsSubscriber}
        onDecline={signOut}
        onSignIn={subscriber.signIn}
        open={loginOpen}
        openKey={loginKey}
        session={subscriber.session}
      />
    </div>
  );
}
