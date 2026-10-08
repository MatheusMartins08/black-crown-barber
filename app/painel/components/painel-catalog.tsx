"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { OpeningPeriod, ScheduleException } from "../../data/hours";
import type { SubscriptionPlan } from "../../data/plans";
import type { Professional } from "../../data/professionals";
import type { Service } from "../../data/services";

// Catálogo do painel, lido pelo layout com a sessão da equipe: todos os profissionais e
// serviços (ativos, inativos e excluídos, porque o histórico aponta para eles) e a comissão
// de avulso (payroll_settings). A agenda e o fechamento identificam tudo pelo id (uuid).
type PainelCatalog = {
  professionals: readonly Professional[];
  services: readonly Service[];
  /** Todos os planos (ativos, inativos e excluídos, porque assinaturas antigas apontam para eles). */
  plans: readonly SubscriptionPlan[];
  /** Fração do preço repassada ao profissional em atendimentos fora do plano. */
  walkInRate: number;
  /** Horário semanal (opening_periods). */
  openingPeriods: readonly OpeningPeriod[];
  /** Exceções da barbearia de hoje em diante (schedule_exceptions). */
  exceptions: readonly ScheduleException[];
};

const PainelCatalogContext = createContext<PainelCatalog>({
  professionals: [],
  services: [],
  plans: [],
  walkInRate: 0,
  openingPeriods: [],
  exceptions: [],
});

export function PainelCatalogProvider({ children, ...catalog }: PainelCatalog & { children: ReactNode }) {
  return <PainelCatalogContext.Provider value={catalog}>{children}</PainelCatalogContext.Provider>;
}

export function usePainelProfessionals() {
  return useContext(PainelCatalogContext).professionals;
}

export function usePainelServices() {
  return useContext(PainelCatalogContext).services;
}

export function usePainelPlans() {
  return useContext(PainelCatalogContext).plans;
}

/** Horário semanal e exceções da barbearia. */
export function usePainelSchedule() {
  const { openingPeriods, exceptions } = useContext(PainelCatalogContext);
  return { periods: openingPeriods, exceptions };
}

export function useWalkInRate() {
  return useContext(PainelCatalogContext).walkInRate;
}

export function findProfessional(professionals: readonly Professional[], id: string | null) {
  return professionals.find((professional) => professional.id === id) ?? null;
}
