import { barbers, services } from "./site";

// Dados ilustrativos do painel. Tudo é gerado de forma determinística (mesma
// semente no servidor e no navegador) até existir um banco de dados real.

export type BarberName = (typeof barbers)[number]["name"];
export type ServiceName = (typeof services)[number]["name"];
export type AppointmentStatus = "agendado" | "concluido" | "faltou" | "cancelado";
export type Period = "dia" | "semana" | "mes";

export type SubscriptionPlan = {
  id: string;
  name: string;
  monthlyPrice: number;
  covers: readonly ServiceName[];
};

export type Client = {
  id: string;
  name: string;
  phone: string;
  planId: string | null;
};

export type Appointment = {
  id: string;
  date: string;
  time: string;
  clientId: string;
  serviceName: ServiceName;
  bookedWith: BarberName;
  performedBy: BarberName;
  status: AppointmentStatus;
};

export const referenceDate = "2026-10-03";
const referenceTime = "14:00";
const dataStart = "2026-09-01";
const dataEnd = "2026-10-10";

export const dataRange = { start: dataStart, end: dataEnd };

export const barberNames = barbers.map((barber) => barber.name) as BarberName[];
export const serviceNames = services.map((service) => service.name) as ServiceName[];

export const servicePrices: Record<ServiceName, number> = {
  "Corte masculino": 55,
  Barba: 45,
  "Corte + barba": 90,
  Sobrancelha: 25,
};

const serviceSlots: Record<ServiceName, number> = {
  "Corte masculino": 1,
  Barba: 1,
  "Corte + barba": 2,
  Sobrancelha: 1,
};

export const subscriptionPlans: SubscriptionPlan[] = [
  { id: "plano-corte", name: "Plano Corte", monthlyPrice: 99, covers: ["Corte masculino"] },
  { id: "plano-barba", name: "Plano Barba", monthlyPrice: 89, covers: ["Barba"] },
  {
    id: "plano-coroa",
    name: "Plano Coroa",
    monthlyPrice: 169,
    covers: ["Corte masculino", "Barba", "Corte + barba"],
  },
];

// Regras de repasse ilustrativas: ajuste aqui quando a barbearia definir os valores reais.
export const commissionRules = {
  walkInRate: 0.5,
  planPayout: {
    "Corte masculino": 22,
    Barba: 18,
    "Corte + barba": 35,
    Sobrancelha: 10,
  } satisfies Record<ServiceName, number>,
};

const clientNames = [
  "André Souza", "Bruno Lacerda", "Caio Ferreira", "Daniel Rocha", "Eduardo Pires",
  "Felipe Moura", "Gabriel Antunes", "Henrique Dias", "Igor Matos", "Jorge Teixeira",
  "Kauã Ribeiro", "Leonardo Prado", "Marcos Vieira", "Nathan Coelho", "Otávio Lima",
  "Paulo Henrique Brandão", "Rafael Quintão", "Samuel Arantes", "Thiago Moreira", "Ulisses Faria",
  "Vinícius Castro", "Wagner Nogueira", "Yuri Campos", "Lucas Gontijo", "Mateus Drummond",
  "Pedro Bicalho", "Ricardo Lanna", "Gustavo Rezende",
];

const clientPlans: (string | null)[] = [
  "plano-coroa", null, "plano-corte", null, "plano-barba", "plano-coroa", null, null,
  "plano-corte", null, "plano-coroa", null, null, "plano-barba", null, "plano-corte",
  null, null, "plano-coroa", null, "plano-corte", null, null, "plano-barba",
  null, "plano-coroa", null, null,
];

export const clients: Client[] = clientNames.map((name, index) => ({
  id: `cli-${String(index + 1).padStart(2, "0")}`,
  name,
  phone: `(31) 9${String(8100 + index * 37).padStart(4, "0")}-${String(1000 + index * 263).slice(-4)}`,
  planId: clientPlans[index] ?? null,
}));

const clientsById = new Map(clients.map((client) => [client.id, client]));
const plansById = new Map(subscriptionPlans.map((plan) => [plan.id, plan]));

export function getClient(clientId: string) {
  return clientsById.get(clientId)!;
}

export function getPlan(planId: string | null) {
  return planId ? plansById.get(planId) ?? null : null;
}

/** O atendimento é coberto pelo plano do cliente? Assinantes pagam à parte serviços fora do plano. */
export function isCoveredByPlan(appointment: Appointment) {
  const plan = getPlan(getClient(appointment.clientId).planId);
  return plan ? plan.covers.includes(appointment.serviceName) : false;
}

export function getServicePrice(appointment: Appointment) {
  return isCoveredByPlan(appointment) ? 0 : servicePrices[appointment.serviceName];
}

export function getPayout(appointment: Appointment) {
  if (appointment.status !== "concluido") return 0;
  return isCoveredByPlan(appointment)
    ? commissionRules.planPayout[appointment.serviceName]
    : servicePrices[appointment.serviceName] * commissionRules.walkInRate;
}

// --- Datas (strings YYYY-MM-DD, calculadas em UTC para não depender do fuso) ---

function toDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`);
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, amount: number) {
  const date = toDate(isoDate);
  date.setUTCDate(date.getUTCDate() + amount);
  return toIsoDate(date);
}

export function getWeekday(isoDate: string) {
  return toDate(isoDate).getUTCDay();
}

export function getPeriodRange(isoDate: string, period: Period) {
  if (period === "dia") return { start: isoDate, end: isoDate };

  if (period === "semana") {
    const offsetToMonday = (getWeekday(isoDate) + 6) % 7;
    const start = addDays(isoDate, -offsetToMonday);
    return { start, end: addDays(start, 6) };
  }

  const start = `${isoDate.slice(0, 8)}01`;
  const nextMonth = toDate(start);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  return { start, end: addDays(toIsoDate(nextMonth), -1) };
}

const weekdayNames = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const monthNames = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function formatLongDate(isoDate: string) {
  const date = toDate(isoDate);
  return `${weekdayNames[date.getUTCDay()]}, ${date.getUTCDate()} de ${monthNames[date.getUTCMonth()]}`;
}

export function formatShortDate(isoDate: string) {
  const [, month, day] = isoDate.split("-");
  return `${day}/${month}`;
}

export function formatMonth(isoDate: string) {
  const date = toDate(isoDate);
  return `${monthNames[date.getUTCMonth()]} de ${date.getUTCFullYear()}`;
}

export function formatCurrency(value: number) {
  const [integer, cents] = value.toFixed(2).split(".");
  return `R$ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents}`;
}

// --- Geração da agenda ilustrativa ---

const closingHourByWeekday: Record<number, number | null> = {
  0: null,
  1: 20,
  2: 20,
  3: 20,
  4: 20,
  5: 21,
  6: 18,
};

function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pickService(random: () => number): ServiceName {
  const roll = random();
  if (roll < 0.38) return "Corte masculino";
  if (roll < 0.6) return "Barba";
  if (roll < 0.88) return "Corte + barba";
  return "Sobrancelha";
}

function toTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function getStatus(date: string, time: string, random: () => number): AppointmentStatus {
  const isPast = date < referenceDate || (date === referenceDate && time < referenceTime);
  const roll = random();

  if (!isPast) return roll < 0.04 ? "cancelado" : "agendado";
  if (roll < 0.05) return "faltou";
  if (roll < 0.09) return "cancelado";
  return "concluido";
}

function generateAppointments() {
  const random = createRandom(20261003);
  const generated: Appointment[] = [];
  const occupancyByBarber: Record<string, number> = {
    "Júlia Andrade": 0.72,
    "Rafael Martins": 0.62,
    "João Almeida": 0.5,
  };

  for (let date = dataStart; date <= dataEnd; date = addDays(date, 1)) {
    const closingHour = closingHourByWeekday[getWeekday(date)];
    if (closingHour === null) continue;

    for (const barberName of barberNames) {
      let minutes = 9 * 60;

      while (minutes < closingHour * 60 - 30) {
        if (random() > occupancyByBarber[barberName]) {
          minutes += 30;
          continue;
        }

        const serviceName = pickService(random);
        const time = toTime(minutes);
        const client = clients[Math.floor(random() * clients.length)];
        const reassigned = random() < 0.06;
        const performedBy = reassigned
          ? barberNames[(barberNames.indexOf(barberName) + 1) % barberNames.length]
          : barberName;

        generated.push({
          id: `ag-${generated.length + 1}`,
          date,
          time,
          clientId: client.id,
          serviceName,
          bookedWith: barberName,
          performedBy,
          status: getStatus(date, time, random),
        });

        minutes += serviceSlots[serviceName] * 30;
      }
    }
  }

  return generated.sort((first, second) =>
    first.date === second.date ? first.time.localeCompare(second.time) : first.date.localeCompare(second.date),
  );
}

export const initialAppointments = generateAppointments();

export type BarberSummary = {
  barberName: BarberName;
  completed: number;
  booked: number;
  byService: Record<ServiceName, number>;
  planCount: number;
  walkInCount: number;
  planPayout: number;
  walkInPayout: number;
  total: number;
};

/** Resumo por profissional considerando quem executou o serviço (não com quem foi marcado). */
export function summarizeByBarber(appointments: Appointment[]): BarberSummary[] {
  return barberNames.map((barberName) => {
    const own = appointments.filter((appointment) => appointment.performedBy === barberName);
    const completed = own.filter((appointment) => appointment.status === "concluido");
    const byService = Object.fromEntries(serviceNames.map((name) => [name, 0])) as Record<ServiceName, number>;
    let planCount = 0;
    let planPayout = 0;
    let walkInPayout = 0;

    for (const appointment of completed) {
      byService[appointment.serviceName] += 1;
      if (isCoveredByPlan(appointment)) {
        planCount += 1;
        planPayout += getPayout(appointment);
      } else {
        walkInPayout += getPayout(appointment);
      }
    }

    return {
      barberName,
      completed: completed.length,
      booked: own.filter((appointment) => appointment.status !== "cancelado").length,
      byService,
      planCount,
      walkInCount: completed.length - planCount,
      planPayout,
      walkInPayout,
      total: planPayout + walkInPayout,
    };
  });
}
