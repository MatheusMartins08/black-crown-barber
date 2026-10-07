"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Professional } from "../../data/professionals";

// Profissionais ativos (do Supabase, lidos pela página no servidor) para todo o fluxo de
// agendamento, sem passar a lista de componente em componente.
const ProfessionalsContext = createContext<readonly Professional[]>([]);

export function BookingCatalogProvider({
  professionals,
  children,
}: {
  professionals: readonly Professional[];
  children: ReactNode;
}) {
  return <ProfessionalsContext.Provider value={professionals}>{children}</ProfessionalsContext.Provider>;
}

export function useBookingProfessionals() {
  return useContext(ProfessionalsContext);
}
