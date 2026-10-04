import type { Reservation } from "../../data/booking";

// Ações oferecidas depois da confirmação. Nenhuma está conectada ainda: ao integrar
// WhatsApp, calendário ou a API de remarcação/cancelamento, preencha `getHref` e
// marque `enabled: true`. Enquanto `enabled` for falso, a tela de sucesso mostra a
// ação como "a configurar", sem simular um comportamento que não existe.

export type ReservationActionId = "whatsapp" | "calendar" | "reschedule" | "cancel";

export type ReservationAction = {
  id: ReservationActionId;
  label: string;
  description: string;
  enabled: boolean;
  getHref?: (reservation: Reservation) => string;
};

export const reservationActions: ReservationAction[] = [
  {
    id: "whatsapp",
    label: "Receber pelo WhatsApp",
    description: "Confirmação e lembrete no número informado.",
    enabled: false,
  },
  {
    id: "calendar",
    label: "Adicionar à agenda",
    description: "Evento com data, horário e endereço.",
    enabled: false,
  },
  {
    id: "reschedule",
    label: "Remarcar horário",
    description: "Escolher outra data com o código da reserva.",
    enabled: false,
  },
  {
    id: "cancel",
    label: "Cancelar reserva",
    description: "Liberar o horário para outro cliente.",
    enabled: false,
  },
];
