"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Professional } from "../../data/professionals";
import type { Service } from "../../data/services";

// Catálogo do painel, lido pelo layout com a sessão da equipe: todos os profissionais e
// serviços (ativos, inativos e excluídos, porque o histórico aponta para eles) e a comissão
// de avulso (payroll_settings). A agenda e o fechamento identificam tudo pelo id (uuid).
type PainelCatalog = {
  professionals: readonly Professional[];
  services: readonly Service[];
  /** Fração do preço repassada ao profissional em atendimentos fora do plano. */
  walkInRate: number;
};

const PainelCatalogContext = createContext<PainelCatalog>({ professionals: [], services: [], walkInRate: 0 });

export function PainelCatalogProvider({ children, ...catalog }: PainelCatalog & { children: ReactNode }) {
  return <PainelCatalogContext.Provider value={catalog}>{children}</PainelCatalogContext.Provider>;
}

export function usePainelProfessionals() {
  return useContext(PainelCatalogContext).professionals;
}

export function usePainelServices() {
  return useContext(PainelCatalogContext).services;
}

export function useWalkInRate() {
  return useContext(PainelCatalogContext).walkInRate;
}

export function findProfessional(professionals: readonly Professional[], id: string | null) {
  return professionals.find((professional) => professional.id === id) ?? null;
}
