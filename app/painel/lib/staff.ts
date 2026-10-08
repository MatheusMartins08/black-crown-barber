import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import {
  openingPeriodColumns,
  scheduleExceptionColumns,
  sortPeriods,
  toOpeningPeriod,
  toScheduleException,
  type OpeningPeriodRow,
  type ScheduleExceptionRow,
} from "../../data/hours";
import { planColumns, sortPlans, toPlan, type PlanRow } from "../../data/plans";
import {
  professionalColumns,
  sortProfessionals,
  toProfessional,
  type ProfessionalRow,
} from "../../data/professionals";
import { serviceColumns, sortServices, staffServiceColumns, toService, type ServiceRow } from "../../data/services";
import { siteImageColumns, toSiteImage, type SiteImageRow } from "../../data/site-images";
import { getSupabaseServerClient } from "../../lib/supabase/server";

export type StaffRole = "admin" | "barbeiro";

export type StaffMember = {
  role: StaffRole;
  /** Profissional do barbeiro (sempre preenchido para "barbeiro"). */
  professionalId: string | null;
  displayName: string | null;
  /** Usuário de login do barbeiro; null para quem entra por e-mail (admin). */
  login: string | null;
  isActive: boolean;
};

/** Tela inicial de cada papel, para onde o login e os redirecionamentos levam. */
export const staffHome: Record<StaffRole, string> = { admin: "/painel", barbeiro: "/painel/equipe" };

type StaffRow = {
  role: StaffRole;
  professional_id: string | null;
  display_name: string | null;
  login: string | null;
  is_active: boolean;
};

/**
 * Usuário logado e a própria linha em staff_members (a RLS deixa cada um ler a sua).
 * Memorizado por requisição: o layout e a página compartilham a mesma consulta. Decide o que
 * mostrar e para onde redirecionar; os dados continuam protegidos pela RLS no banco.
 */
export const getCurrentStaff = cache(async () => {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: row } = await supabase
    .from("staff_members")
    .select("role, professional_id, display_name, login, is_active")
    .eq("user_id", userId)
    .maybeSingle();
  const staff = row as StaffRow | null;

  return {
    userId,
    email: typeof data.claims.email === "string" ? data.claims.email : "",
    staff: staff
      ? ({
          role: staff.role,
          professionalId: staff.professional_id,
          displayName: staff.display_name,
          login: staff.login,
          isActive: staff.is_active,
        } satisfies StaffMember)
      : null,
  };
});

/**
 * Confere o papel em cada página e layout (o layout não roda de novo a cada navegação).
 * Sem sessão → /painel/entrar; papel errado → a tela inicial do próprio papel; sem cadastro na
 * equipe ou com o acesso desativado → null (a tela mostra "Sem acesso").
 */
export async function requireStaff(role: StaffRole) {
  const current = await getCurrentStaff();
  if (!current) redirect("/painel/entrar");
  const { staff } = current;
  if (!staff || !staff.isActive) return null;
  if (staff.role !== role) redirect(staffHome[staff.role]);
  return { ...current, staff };
}

export type BarberAccess = {
  /** Usuário de login; null se o acesso foi criado por e-mail. */
  login: string | null;
  isActive: boolean;
};

/** Acesso ao painel de cada profissional (id → login e status). Só o admin lê (RLS); nunca a senha. */
export async function getBarberAccess(): Promise<Record<string, BarberAccess>> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("staff_members")
    .select("professional_id, login, is_active")
    .eq("role", "barbeiro")
    .not("professional_id", "is", null);
  if (error) throw new Error("Não foi possível carregar os acessos da equipe.");
  return Object.fromEntries(
    (data as { professional_id: string; login: string | null; is_active: boolean }[]).map((row) => [
      row.professional_id,
      { login: row.login, isActive: row.is_active },
    ]),
  );
}

export type ProfessionalUsage = {
  /** Tem atendimentos, bloqueios de agenda ou login: a exclusão mantém o cadastro só para o histórico. */
  hasHistory: boolean;
  /** Tem login de barbeiro no painel (é removido junto com a exclusão). */
  hasLogin: boolean;
  /** Horários "agendado" daqui para frente (continuam na agenda se for inativado ou excluído). */
  upcoming: number;
};

/** Uso de cada profissional (id → uso), para a tela Edição do site > Barbeiros. */
export async function getProfessionalUsage(): Promise<Record<string, ProfessionalUsage>> {
  const supabase = await getSupabaseServerClient();
  const [appointments, blocks, logins] = await Promise.all([
    supabase.from("appointments").select("booked_professional_id, performed_by_id, status, starts_at"),
    supabase.from("schedule_blocks").select("professional_id"),
    supabase.from("staff_members").select("professional_id").not("professional_id", "is", null),
  ]);
  if (appointments.error || blocks.error || logins.error) {
    throw new Error("Não foi possível carregar o histórico da equipe.");
  }

  const usage: Record<string, ProfessionalUsage> = {};
  const entry = (id: string) => (usage[id] ??= { hasHistory: false, hasLogin: false, upcoming: 0 });
  const now = Date.now();

  for (const row of appointments.data) {
    entry(row.booked_professional_id).hasHistory = true;
    entry(row.performed_by_id).hasHistory = true;
    if (row.status === "agendado" && new Date(row.starts_at).getTime() >= now) entry(row.performed_by_id).upcoming += 1;
  }
  for (const row of blocks.data) entry(row.professional_id).hasHistory = true;
  for (const row of logins.data) {
    if (!row.professional_id) continue;
    entry(row.professional_id).hasHistory = true;
    entry(row.professional_id).hasLogin = true;
  }
  return usage;
}

/**
 * Todos os profissionais, inclusive inativos (a RLS mostra os inativos só para a equipe):
 * o histórico da agenda e do fechamento continua apontando para eles.
 */
export const getStaffProfessionals = cache(async () => {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("professionals").select(professionalColumns).order("sort_order");
  if (error) throw new Error(`Não foi possível carregar a equipe: ${error.message}`);
  return sortProfessionals((data as unknown as ProfessionalRow[]).map(toProfessional));
});

/** Imagens editáveis do site (galeria e foto da barbearia), sem cache: o painel vê o que acabou de salvar. */
export async function getEditableSiteImages() {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("site_images").select(siteImageColumns).order("sort_order");
  if (error) throw new Error(`Não foi possível carregar as imagens do site: ${error.message}`);
  return (data as SiteImageRow[]).map(toSiteImage);
}

/** Todos os serviços (inclusive inativos e excluídos, para o histórico) com o repasse do plano. */
export const getStaffServices = cache(async () => {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("services").select(staffServiceColumns).order("sort_order");
  if (error) throw new Error(`Não foi possível carregar os serviços: ${error.message}`);
  return sortServices((data as unknown as ServiceRow[]).map(toService));
});

/** Serviços sem o repasse do plano: o catálogo do painel dos barbeiros. */
export const getTeamServices = cache(async () => {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("services").select(serviceColumns).order("sort_order");
  if (error) throw new Error(`Não foi possível carregar os serviços: ${error.message}`);
  return sortServices((data as unknown as ServiceRow[]).map(toService));
});

/** Comissão de avulso (payroll_settings), visível só para o admin. */
export const getWalkInRate = cache(async () => {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.from("payroll_settings").select("walk_in_commission_rate").eq("id", 1).maybeSingle();
  return data ? Number(data.walk_in_commission_rate) : 0;
});

export type ServiceUsage = {
  /** Tem atendimentos: a exclusão mantém o cadastro só para o histórico. */
  hasHistory: boolean;
  /** Horários "agendado" daqui para frente (continuam na agenda se for inativado ou excluído). */
  upcoming: number;
  /** Nomes dos planos que incluem o serviço (não pode ser excluído enquanto estiver em algum). */
  plans: string[];
};

/** Uso de cada serviço (id → uso), para a tela Edição do site > Serviços. */
export async function getServiceUsage(): Promise<Record<string, ServiceUsage>> {
  const supabase = await getSupabaseServerClient();
  const [appointments, plans] = await Promise.all([
    // Por serviço do atendimento: um horário com Corte + Sobrancelha conta para os dois.
    supabase.from("appointment_services").select("service_id, appointments(status, starts_at)"),
    supabase.from("plan_services").select("service_id, subscription_plans(name)"),
  ]);
  if (appointments.error || plans.error) throw new Error("Não foi possível carregar o uso dos serviços.");

  const usage: Record<string, ServiceUsage> = {};
  const entry = (id: string) => (usage[id] ??= { hasHistory: false, upcoming: 0, plans: [] });
  const now = Date.now();

  type ItemRow = { service_id: string; appointments: { status: string; starts_at: string } | null };
  for (const row of appointments.data as unknown as ItemRow[]) {
    entry(row.service_id).hasHistory = true;
    const appointment = row.appointments;
    if (appointment?.status === "agendado" && new Date(appointment.starts_at).getTime() >= now) {
      entry(row.service_id).upcoming += 1;
    }
  }
  for (const row of plans.data as unknown as { service_id: string; subscription_plans: { name: string } | null }[]) {
    if (row.subscription_plans) entry(row.service_id).plans.push(row.subscription_plans.name);
  }
  return usage;
}

/** Todos os planos (inclusive inativos e excluídos, para o histórico) com os serviços incluídos. */
export const getStaffPlans = cache(async () => {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("subscription_plans").select(planColumns).order("sort_order");
  if (error) throw new Error(`Não foi possível carregar os planos: ${error.message}`);
  return sortPlans((data as unknown as PlanRow[]).map(toPlan));
});

export type PlanUsage = {
  /** Assinantes com período em aberto (ativos ou congelados): o plano não pode ser excluído. */
  current: number;
  /** Já teve assinatura (inclusive encerrada): a exclusão mantém o cadastro só para o histórico. */
  hasHistory: boolean;
};

/** Uso de cada plano (id → uso), para a tela Edição do site > Planos. */
export async function getPlanUsage(): Promise<Record<string, PlanUsage>> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("customer_subscriptions").select("plan_id, status, ended_at");
  if (error) throw new Error("Não foi possível carregar o uso dos planos.");

  const usage: Record<string, PlanUsage> = {};
  for (const row of data) {
    const entry = (usage[row.plan_id] ??= { current: 0, hasHistory: false });
    entry.hasHistory = true;
    if (row.ended_at === null && row.status !== "cancelada") entry.current += 1;
  }
  return usage;
}

/**
 * Horário semanal e exceções a partir de hoje (as passadas não interessam ao painel), da
 * barbearia e de todos os profissionais (professionalId). Exceções e horários dos
 * profissionais só a equipe lê (RLS).
 */
export const getStaffSchedule = cache(async () => {
  const supabase = await getSupabaseServerClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [periods, exceptions] = await Promise.all([
    supabase.from("opening_periods").select(openingPeriodColumns),
    supabase
      .from("schedule_exceptions")
      .select(scheduleExceptionColumns)
      .gte("ends_on", today)
      .order("starts_on")
      .order("kind"),
  ]);
  if (periods.error || exceptions.error) throw new Error("Não foi possível carregar o horário de funcionamento.");
  return {
    periods: sortPeriods((periods.data as OpeningPeriodRow[]).map(toOpeningPeriod)),
    exceptions: (exceptions.data as ScheduleExceptionRow[]).map(toScheduleException),
  };
});
