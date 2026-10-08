"use client";

import { useEffect, useMemo, useReducer } from "react";
import {
  ANY_PROFESSIONAL,
  emptyDraft,
  getProfessional,
  getTodayIso,
  hasErrors,
  isProfessionalChoice,
  isValidServiceSelection,
  isWithinBookingWindow,
  offersServices,
  validateCustomer,
  type BookingDraft,
  type CustomerDetails,
  type CustomerType,
  type ProfessionalChoice,
  type ProfessionalId,
  type ServiceId,
  type TimeSlot,
} from "../../data/booking";
import type { Professional } from "../../data/professionals";
import type { Service } from "../../data/services";

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
  | { type: "setServices"; serviceIds: ServiceId[] }
  | { type: "selectProfessional"; professionalId: ProfessionalChoice }
  | { type: "selectDate"; date: string }
  | { type: "selectSlot"; date: string; slot: TimeSlot }
  | { type: "syncSlots"; date: string; slots: TimeSlot[] }
  | { type: "updateCustomer"; changes: Partial<CustomerDetails> }
  | { type: "goTo"; step: StepId }
  | { type: "reset" };

const storageKey = "black-crown:booking-draft:v3";
/** Rascunho de antes de existirem vários serviços (`serviceId`): convertido ao restaurar. */
const legacyStorageKey = "black-crown:booking-draft:v2";

/** Etapa mais avançada que as escolhas atuais permitem abrir. */
export function getMaxReachableStep(draft: BookingDraft): StepId {
  if (!draft.customerType) return "perfil";
  if (!draft.serviceIds.length) return "servico";
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

/** Reducer do fluxo. Recebe os profissionais ativos para saber quem atende cada serviço. */
function createReducer(professionals: readonly Professional[]) {
  return (state: BookingState, action: Action) => reducer(state, action, professionals);
}

function reducer(state: BookingState, action: Action, professionals: readonly Professional[]): BookingState {
  const { draft } = state;

  switch (action.type) {
    case "setCustomerType": {
      if (draft.customerType === action.customerType) return state;
      const next = { ...draft, customerType: action.customerType };
      return { step: action.customerType ? clampStep(next, state.step) : "perfil", draft: next };
    }
    case "setServices": {
      if (action.serviceIds.join() === draft.serviceIds.join()) return state;
      // A duração muda: o horário escolhido deixa de valer. A data fica para buscar de novo.
      const keepsProfessional =
        draft.professionalId && offersServices(professionals, draft.professionalId, action.serviceIds);
      return {
        ...state,
        draft: {
          ...draft,
          ...clearedTime,
          serviceIds: action.serviceIds,
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
  /** Profissionais ativos (Supabase). Um rascunho que cite alguém fora da lista é descartado. */
  professionals: readonly Professional[];
  /** Serviços ativos (Supabase). Idem para um serviço que saiu do catálogo. */
  services: readonly Service[];
  initialServiceId: ServiceId | null;
  initialProfessionalId: ProfessionalChoice | null;
  /** Lê o rascunho salvo ao montar (somente no cliente). */
  restore: boolean;
  /** Salva o rascunho a cada mudança (desligado durante a hidratação). */
  persist: boolean;
};

export function hasStoredDraft() {
  try {
    return sessionStorage.getItem(storageKey) !== null || sessionStorage.getItem(legacyStorageKey) !== null;
  } catch {
    return false;
  }
}

type StoredState = { step?: unknown; draft?: Partial<BookingDraft> & { serviceId?: unknown } };

/** Rascunho v2 (um serviço) → v3 (lista). O resultado ainda passa por sanitizeDraft. */
export function upgradeStoredState(stored: StoredState): StoredState {
  const draft = stored.draft;
  if (!draft || Array.isArray(draft.serviceIds)) return stored;
  const { serviceId, ...rest } = draft;
  return { ...stored, draft: { ...rest, serviceIds: typeof serviceId === "string" ? [serviceId] : [] } };
}

function readStoredState(): StoredState | null {
  try {
    const stored = sessionStorage.getItem(storageKey) ?? sessionStorage.getItem(legacyStorageKey);
    return stored ? upgradeStoredState(JSON.parse(stored) as StoredState) : null;
  } catch {
    return null;
  }
}

function isStepId(value: unknown): value is StepId {
  return allSteps.includes(value as StepId);
}

export function sanitizeDraft(
  value: Partial<BookingDraft> | undefined,
  today: string,
  professionals: readonly Professional[],
  services: readonly Service[],
): BookingDraft {
  const customerType = value?.customerType === "assinante" || value?.customerType === "avulso" ? value.customerType : null;
  const storedIds = Array.isArray(value?.serviceIds) ? value.serviceIds : [];
  // Uma seleção que deixou de valer (serviço fora do catálogo, combo novo) é descartada inteira.
  const serviceIds = isValidServiceSelection(services, storedIds) ? [...storedIds] : [];
  const professionalId =
    serviceIds.length &&
    isProfessionalChoice(professionals, value?.professionalId) &&
    offersServices(professionals, value.professionalId, serviceIds)
      ? value.professionalId
      : null;
  const date = typeof value?.date === "string" && isWithinBookingWindow(value.date, today) ? value.date : null;
  const time = date && professionalId && typeof value?.time === "string" ? value.time : null;
  const assigned = getProfessional(professionals, value?.assignedProfessionalId ?? null)?.slug ?? null;
  const customer = value?.customer;

  return {
    customerType,
    serviceIds,
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

function init({ professionals, services, initialServiceId, initialProfessionalId, restore }: InitOptions): BookingState {
  const stored = restore ? readStoredState() : null;
  const hasLinkSelection = Boolean(initialServiceId || initialProfessionalId);

  // Um link com serviço/profissional ("Agendar com Júlia") tem prioridade sobre o
  // rascunho salvo e sempre começa pela pergunta de assinante; a resposta e os dados
  // de contato já informados são mantidos.
  if (hasLinkSelection || !stored) {
    const kept = stored ? sanitizeDraft(stored.draft, getTodayIso(), professionals, services) : emptyDraft;
    const professionalId =
      initialProfessionalId &&
      (!initialServiceId || offersServices(professionals, initialProfessionalId, [initialServiceId]))
        ? initialProfessionalId
        : null;
    return {
      step: "perfil",
      draft: {
        ...emptyDraft,
        customerType: kept.customerType,
        serviceIds: initialServiceId ? [initialServiceId] : [],
        professionalId,
        customer: kept.customer,
      },
    };
  }

  const draft = sanitizeDraft(stored.draft, getTodayIso(), professionals, services);
  return { step: clampStep(draft, isStepId(stored.step) ? stored.step : "perfil"), draft };
}

export default function useBookingDraft(options: InitOptions) {
  const reducerWithCatalog = useMemo(() => createReducer(options.professionals), [options.professionals]);
  const [state, dispatch] = useReducer(reducerWithCatalog, options, init);

  useEffect(() => {
    if (!options.persist) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
      sessionStorage.removeItem(legacyStorageKey);
    } catch {
      // Sem armazenamento, o fluxo continua funcionando apenas em memória.
    }
  }, [options.persist, state]);

  return [state, dispatch] as const;
}

export type BookingDispatch = ReturnType<typeof useBookingDraft>[1];
