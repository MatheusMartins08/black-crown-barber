import { daysBetween, getAppointmentItems, getServicePrice, type Appointment } from "./painel";

// Ficha do cliente: números e preferências calculados do histórico guardado (os atendimentos
// dos últimos meses; a retenção apaga os mais antigos). Puro: sem React e sem rede.

export type ClientRecordSummary = {
  /** Atendimentos concluídos. */
  visits: number;
  /** Soma cobrada nos concluídos (o que o plano cobriu não entra). */
  spent: number;
  /** Cobrado por visita concluída. `null` sem visitas. */
  averageTicket: number | null;
  /** Dias, em média, entre visitas concluídas. `null` com menos de duas. */
  averageInterval: number | null;
  noShows: number;
  cancellations: number;
  lastVisit: Appointment | null;
  /** Próximo horário agendado (hoje em diante). */
  next: Appointment | null;
  /** Profissional e serviço mais frequentes nos concluídos (empate: o mais recente). */
  favoriteBarber: { name: string; count: number } | null;
  favoriteService: { name: string; count: number } | null;
};

function mostFrequent(names: string[]) {
  // `names` vem do mais recente ao mais antigo: no empate fica o primeiro visto.
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  let best: { name: string; count: number } | null = null;
  for (const [name, count] of counts) if (!best || count > best.count) best = { name, count };
  return best;
}

/** `appointments` do mais recente ao mais antigo, como fetchClientRecord devolve. */
export function summarizeClientHistory(appointments: readonly Appointment[], today: string): ClientRecordSummary {
  const completed = appointments.filter((appointment) => appointment.status === "concluido");
  const spent = completed.reduce((sum, appointment) => sum + getServicePrice(appointment), 0);
  const first = completed.at(-1);
  const upcoming = appointments.filter((appointment) => appointment.status === "agendado" && appointment.date >= today);

  return {
    visits: completed.length,
    spent: Math.round(spent * 100) / 100,
    averageTicket: completed.length ? Math.round((spent / completed.length) * 100) / 100 : null,
    averageInterval:
      completed.length >= 2 && first
        ? Math.round(daysBetween(first.date, completed[0].date) / (completed.length - 1))
        : null,
    noShows: appointments.filter((appointment) => appointment.status === "faltou").length,
    cancellations: appointments.filter((appointment) => appointment.status === "cancelado").length,
    lastVisit: completed[0] ?? null,
    next: upcoming.at(-1) ?? null,
    favoriteBarber: mostFrequent(completed.map((appointment) => appointment.performedBy)),
    favoriteService: mostFrequent(
      completed.flatMap((appointment) => getAppointmentItems(appointment).map((item) => item.serviceName)),
    ),
  };
}
