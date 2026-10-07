"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Professional } from "../../data/professionals";

// Todos os profissionais (ativos e inativos), lidos pelo layout do painel com a sessão da
// equipe. A agenda e o fechamento identificam cada um pelo id (uuid), nunca pelo nome.
const ProfessionalsContext = createContext<readonly Professional[]>([]);

export function PainelCatalogProvider({
  professionals,
  children,
}: {
  professionals: readonly Professional[];
  children: ReactNode;
}) {
  return <ProfessionalsContext.Provider value={professionals}>{children}</ProfessionalsContext.Provider>;
}

export function usePainelProfessionals() {
  return useContext(ProfessionalsContext);
}

export function findProfessional(professionals: readonly Professional[], id: string | null) {
  return professionals.find((professional) => professional.id === id) ?? null;
}
