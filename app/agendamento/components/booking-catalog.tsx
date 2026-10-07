"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SubscriptionPlan } from "../../data/plans";
import type { Professional } from "../../data/professionals";
import type { Service } from "../../data/services";

// Catálogo ativo (do Supabase, lido pela página no servidor) para todo o fluxo de
// agendamento, sem passar listas de componente em componente.
type BookingCatalog = {
  professionals: readonly Professional[];
  services: readonly Service[];
  /** Planos não excluídos (inclusive inativos, para quem ainda assina um deles). */
  plans: readonly SubscriptionPlan[];
};

const BookingCatalogContext = createContext<BookingCatalog>({ professionals: [], services: [], plans: [] });

export function BookingCatalogProvider({
  professionals,
  services,
  plans,
  children,
}: BookingCatalog & { children: ReactNode }) {
  return (
    <BookingCatalogContext.Provider value={{ professionals, services, plans }}>{children}</BookingCatalogContext.Provider>
  );
}

export function useBookingProfessionals() {
  return useContext(BookingCatalogContext).professionals;
}

export function useBookingServices() {
  return useContext(BookingCatalogContext).services;
}

export function useBookingPlans() {
  return useContext(BookingCatalogContext).plans;
}
