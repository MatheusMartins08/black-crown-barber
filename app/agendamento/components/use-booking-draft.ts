"use client";

import { useEffect, useReducer } from "react";
import {
  ANY_PROFESSIONAL,
  emptyDraft,
  getProfessional,
  getTodayIso,
  hasErrors,
  isProfessionalChoice,
  isServiceId,
  isWithinBookingWindow,
  offersService,
  validateCustomer,
  type BookingDraft,
  type CustomerDetails,
  type CustomerType,
  type ProfessionalChoice,
  type ProfessionalId,
  type ServiceId,
  type TimeSlot,
} from "../../data/booking";

export type StepId = "perfil" | "servico" | "profissional" | "horario" | "dados" | "confirmacao";

const allSteps: readonly StepId[] = ["perfil", "servico", "profissional", "horario", "dados", "confirmacao"];

export const stepLabels: Record<StepId, string> = {
  perfil: "Perfil",
  servico: "Serviço",
  profissional: "Profissional",
  horario: "Data e horário",
  dados: "Dados",
  confirmacao: "Confirmação",
};

/** Etapas do fluxo. O assinante já tem os dados na conta, então não passa por "Dados". */
export function getBookingSteps(customerType: CustomerType | null): readonly StepId[] {
  return customerType === "assinante" ? allSteps.filter((step) => step !== "dados") : allSteps;
}

export type BookingState = {
  step: StepId;
  draft: BookingDraft;
};

type Action =
  | { type: "setCustomerType"; customerType: CustomerType | null }
  | { type: "selectService"; serviceId: ServiceId }
  | { type: "selectProfessional"; professionalId: ProfessionalChoice }
  | { type: "selectDate"; date: string }
  | { type: "selectSlot"; date: string; slot: TimeSlot }
  | { type: "syncSlots"; date: string; slots: TimeSlot[] }
  | { type: "updateCustomer"; changes: Partial<CustomerDetails> }
  | { type: "goTo"; step: StepId }
  | { type: "reset" };

const storageKey = "black-crown:booking-draft:v2";

/** Etapa mais avançada que as escolhas atuais permitem abrir. */
export function getMaxReachableStep(draft: BookingDraft): StepId {
  if (!draft.customerType) return "perfil";
  if (!draft.serviceId) return "servico";
  if (!draft.professionalId) return "profissional";
  if (!draft.date || !draft.time) return "horario";
  if (draft.customerType === "avulso" && hasErrors(validateCustomer(draft.customer))) return "dados";
  return "confirmacao";
}

/** Limita a etapa pedida à mais avançada permitida, dentro das etapas deste tipo de cliente. */
function clampStep(draft: BookingDraft, step: StepId): StepId {
  const steps = getBookingSteps(draft.customerType);
  const maxIndex = steps.indexOf(getMaxReachableStep(draft));
  const requested = steps.indexOf(step);
  // "dados" não existe para assinante: segue para a confirmação.
  const index = requested === -1 ? steps.indexOf("confirmacao") : requested;
  return steps[Math.max(0, Math.min(index, maxIndex))];
}

function pickAssignee(draft: BookingDraft, slot: TimeSlot): ProfessionalId | null {
  if (draft.professionalId && draft.professionalId !== ANY_PROFESSIONAL) return draft.professionalId;
  if (draft.assignedProfessionalId && slot.professionalIds.includes(draft.assignedProfessionalId)) {
    return draft.assignedProfessionalId;
  }
  return slot.professionalIds[0] ?? null;
}

const clearedTime = { time: null, assignedProfessionalId: null };

function reducer(state: BookingState, action: Action): BookingState {
  const { draft } = state;

  switch (action.type) {
    case "setCustomerType": {
      if (draft.customerType === action.customerType) return state;
      const next = { ...draft, customerType: action.customerType };
      return { step: action.customerType ? clampStep(next, state.step) : "perfil", draft: next };
    }
    case "selectService": {
      if (draft.serviceId === action.serviceId) return state;
      const keepsProfessional = draft.professionalId && offersService(draft.professionalId, action.serviceId);
      return {
        ...state,
        draft: {
          ...draft,
          ...clearedTime,
          serviceId: action.serviceId,
          professionalId: keepsProfessional ? draft.professionalId : null,
        },
      };
    }
    case "selectProfessional":
      if (draft.professionalId === action.professionalId) return state;
      return { ...state, draft: { ...draft, ...clearedTime, professionalId: action.professionalId } };
    case "selectDate":
      if (draft.date === action.date) return state;
      return { ...state, draft: { ...draft, ...clearedTime, date: action.date } };
    case "selectSlot":
      return {
        ...state,
        draft: {
          ...draft,
          date: action.date,
          time: action.slot.time,
          assignedProfessionalId: pickAssignee(draft, action.slot),
        },
      };
    case "syncSlots": {
      // Descarta um horário salvo que deixou de existir (serviço trocado, horário passado).
      if (draft.date !== action.date || !draft.time) return state;
      const slot = action.slots.find((item) => item.time === draft.time);
      if (!slot) return { ...state, draft: { ...draft, ...clearedTime } };
      const assignedProfessionalId = pickAssignee(draft, slot);
      if (assignedProfessionalId === draft.assignedProfessionalId) return state;
      return { ...state, draft: { ...draft, assignedProfessionalId } };
    }
    case "updateCustomer":
      return { ...state, draft: { ...draft, customer: { ...draft.customer, ...action.changes } } };
    case "goTo":
      return { ...state, step: clampStep(draft, action.step) };
    case "reset":
      // Mantém quem é o cliente e os dados de contato para um próximo agendamento.
      return {
        step: draft.customerType ? "servico" : "perfil",
        draft: { ...emptyDraft, customerType: draft.customerType, customer: draft.customer },
      };
  }
}

type InitOptions = {
  initialServiceId: ServiceId | null;
  initialProfessionalId: ProfessionalChoice | null;
  /** Lê o rascunho salvo ao montar (somente no cliente). */
  restore: boolean;
  /** Salva o rascunho a cada mudança (desligado durante a hidratação). */
  persist: boolean;
};

export function hasStoredDraft() {
  try {
    return sessionStorage.getItem(storageKey) !== null;
  } catch {
    return false;
  }
}

function readStoredState(): BookingState | null {
  try {
    const stored = sessionStorage.getItem(storageKey);
    return stored ? (JSON.parse(stored) as BookingState) : null;
  } catch {
    return null;
  }
}

function isStepId(value: unknown): value is StepId {
  return allSteps.includes(value as StepId);
}

function sanitizeDraft(value: Partial<BookingDraft> | undefined, today: string): BookingDraft {
  const customerType = value?.customerType === "assinante" || value?.customerType === "avulso" ? value.customerType : null;
  const serviceId = isServiceId(value?.serviceId) ? value.serviceId : null;
  const professionalId =
    serviceId && isProfessionalChoice(value?.professionalId) && offersService(value.professionalId, serviceId)
      ? value.professionalId
      : null;
  const date = typeof value?.date === "string" && isWithinBookingWindow(value.date, today) ? value.date : null;
  const time = date && professionalId && typeof value?.time === "string" ? value.time : null;
  const assigned = getProfessional(value?.assignedProfessionalId ?? null)?.id ?? null;
  const customer = value?.customer;

  return {
    customerType,
    serviceId,
    professionalId,
    date,
    time,
    assignedProfessionalId: time ? assigned : null,
    customer: {
      name: typeof customer?.name === "string" ? customer.name : "",
      phone: typeof customer?.phone === "string" ? customer.phone : "",
      email: typeof customer?.email === "string" ? customer.email : "",
      whatsappOptIn: customer?.whatsappOptIn === true,
    },
  };
}

function init({ initialServiceId, initialProfessionalId, restore }: InitOptions): BookingState {
  const stored = restore ? readStoredState() : null;
  const hasLinkSelection = Boolean(initialServiceId || initialProfessionalId);

  // Um link com serviço/profissional ("Agendar com Júlia") tem prioridade sobre o
  // rascunho salvo e sempre começa pela pergunta de assinante; a resposta e os dados
  // de contato já informados são mantidos.
  if (hasLinkSelection || !stored) {
    const kept = stored ? sanitizeDraft(stored.draft, getTodayIso()) : emptyDraft;
    const professionalId =
      initialProfessionalId && (!initialServiceId || offersService(initialProfessionalId, initialServiceId))
        ? initialProfessionalId
        : null;
    return {
      step: "perfil",
      draft: {
        ...emptyDraft,
        customerType: kept.customerType,
        serviceId: initialServiceId,
        professionalId,
        customer: kept.customer,
      },
    };
  }

  const draft = sanitizeDraft(stored.draft, getTodayIso());
  return { step: clampStep(draft, isStepId(stored.step) ? stored.step : "perfil"), draft };
}

export default function useBookingDraft(options: InitOptions) {
  const [state, dispatch] = useReducer(reducer, options, init);

  useEffect(() => {
    if (!options.persist) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Sem armazenamento, o fluxo continua funcionando apenas em memória.
    }
  }, [options.persist, state]);

  return [state, dispatch] as const;
}

export type BookingDispatch = ReturnType<typeof useBookingDraft>[1];
