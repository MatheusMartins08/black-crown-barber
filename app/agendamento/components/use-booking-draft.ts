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
  type ProfessionalChoice,
  type ProfessionalId,
  type ServiceId,
  type TimeSlot,
} from "../../data/booking";

export const bookingSteps = ["Serviço", "Profissional", "Data e horário", "Dados", "Confirmação"] as const;
export type StepIndex = 0 | 1 | 2 | 3 | 4;

export type BookingState = {
  step: StepIndex;
  draft: BookingDraft;
};

type Action =
  | { type: "selectService"; serviceId: ServiceId }
  | { type: "selectProfessional"; professionalId: ProfessionalChoice }
  | { type: "selectDate"; date: string }
  | { type: "selectSlot"; date: string; slot: TimeSlot }
  | { type: "syncSlots"; date: string; slots: TimeSlot[] }
  | { type: "updateCustomer"; changes: Partial<CustomerDetails> }
  | { type: "goTo"; step: StepIndex }
  | { type: "reset" };

const storageKey = "black-crown:booking-draft:v1";

/** Etapa mais avançada que as escolhas atuais permitem abrir. */
export function getMaxReachableStep(draft: BookingDraft): StepIndex {
  if (!draft.serviceId) return 0;
  if (!draft.professionalId) return 1;
  if (!draft.date || !draft.time) return 2;
  if (hasErrors(validateCustomer(draft.customer))) return 3;
  return 4;
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
      return { ...state, step: Math.min(action.step, getMaxReachableStep(draft)) as StepIndex };
    case "reset":
      return { step: 0, draft: { ...emptyDraft, customer: draft.customer } };
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

function sanitizeDraft(value: Partial<BookingDraft> | undefined, today: string): BookingDraft {
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
    serviceId,
    professionalId,
    date,
    time,
    assignedProfessionalId: time ? assigned : null,
    customer: {
      name: typeof customer?.name === "string" ? customer.name : "",
      phone: typeof customer?.phone === "string" ? customer.phone : "",
      email: typeof customer?.email === "string" ? customer.email : "",
      notes: typeof customer?.notes === "string" ? customer.notes : "",
    },
  };
}

function init({ initialServiceId, initialProfessionalId, restore }: InitOptions): BookingState {
  const stored = restore ? readStoredState() : null;
  const hasLinkSelection = Boolean(initialServiceId || initialProfessionalId);

  // Um link com serviço/profissional ("Agendar com Júlia") tem prioridade sobre o
  // rascunho salvo; os dados de contato já digitados são mantidos.
  if (hasLinkSelection || !stored) {
    const customer = stored ? sanitizeDraft(stored.draft, getTodayIso()).customer : emptyDraft.customer;
    const professionalId =
      initialProfessionalId && (!initialServiceId || offersService(initialProfessionalId, initialServiceId))
        ? initialProfessionalId
        : null;
    return {
      step: initialServiceId ? 1 : 0,
      draft: { ...emptyDraft, serviceId: initialServiceId, professionalId, customer },
    };
  }

  const draft = sanitizeDraft(stored.draft, getTodayIso());
  const savedStep = typeof stored.step === "number" ? stored.step : 0;
  return { step: Math.max(0, Math.min(savedStep, getMaxReachableStep(draft))) as StepIndex, draft };
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
