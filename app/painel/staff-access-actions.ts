"use server";

import "server-only";
import {
  getStaffLoginEmail,
  normalizeStaffLogin,
  validateStaffLogin,
  validateStaffPassword,
} from "../data/staff";
import { getSupabaseAdminClient } from "../lib/supabase/admin";
import { getSupabaseServerClient } from "../lib/supabase/server";
import { identityMetadata, isShopIdentity } from "./lib/auth-identity";
import { checkShopAdmin, shopStaffMessages } from "./lib/shop-admin";
import type { SiteActionResult } from "./site-actions";

// Edição do site > Barbeiros > Acesso ao painel. Cada barbeiro tem o próprio login, ligado ao
// cadastro dele (staff_members.professional_id); quem cria e mantém é o admin.
//
// - A senha fica só no Supabase Auth (bcrypt). Nada aqui guarda, devolve ou registra senha.
// - Criar o login, trocar o usuário e redefinir a senha usam a SUPABASE_SECRET_KEY (só no
//   servidor). A linha em staff_members é gravada com a sessão do próprio admin (RLS).
// - Desativar não apaga nada: staff_members.is_active = false (o banco corta o acesso na hora)
//   e o usuário fica banido no Auth (não entra nem renova a sessão). Reativar desfaz os dois.

type Supabase = Awaited<ReturnType<typeof getSupabaseServerClient>>;

const missingSecret =
  "Configure a SUPABASE_SECRET_KEY (.env.local e Vercel) para criar logins e trocar senhas da equipe.";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** "Banido" por ~100 anos: o Auth recusa login e renovação até reativar. */
const banForever = "876000h";

function failure(message: string): SiteActionResult {
  return { ok: false, message };
}

/** Sessão do admin ativo (cookie) e o profissional (não excluído), ou o motivo de recusa. */
type AdminAuth =
  | { error: SiteActionResult }
  | {
      supabase: Supabase;
      shopId: string;
      admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>;
      professional: { id: string; name: string };
    };

async function requireAdminFor(professionalId: unknown): Promise<AdminAuth> {
  if (typeof professionalId !== "string" || !uuidPattern.test(professionalId)) {
    return { error: failure("Profissional não encontrado. Recarregue a página.") };
  }

  // Conferido no banco, sem cache: logo abaixo vem o Auth Admin (service role, sem RLS).
  const auth = await checkShopAdmin();
  if ("refusal" in auth) {
    return {
      error: failure(
        auth.refusal === "not_staff" ? "Só o administrador gerencia o acesso da equipe." : shopStaffMessages[auth.refusal],
      ),
    };
  }
  const { supabase, shopId } = auth;

  // A RLS só devolve profissionais da loja do admin.
  const { data: professional } = await supabase
    .from("professionals")
    .select("id, name")
    .eq("id", professionalId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!professional) return { error: failure("Profissional não encontrado. Recarregue a página.") };

  const admin = getSupabaseAdminClient();
  if (!admin) return { error: failure(missingSecret) };
  return { supabase, shopId, admin, professional: professional as { id: string; name: string } };
}

/** Login do barbeiro deste profissional (só o admin lê as linhas dos outros). */
async function getBarberLogin(supabase: Supabase, professionalId: string) {
  const { data } = await supabase
    .from("staff_members")
    .select("user_id, role, login, is_active")
    .eq("professional_id", professionalId)
    .maybeSingle();
  return data as { user_id: string; role: string; login: string | null; is_active: boolean } | null;
}

/** Usuário já usado por outra pessoa da equipe (o Auth também recusa e-mail repetido). */
async function isLoginTaken(supabase: Supabase, login: string, exceptUserId: string | null) {
  const { data } = await supabase.from("staff_members").select("user_id").eq("login", login).maybeSingle();
  return Boolean(data && data.user_id !== exceptUserId);
}

/** O Auth recusa e-mail repetido com "email_exists" ou, na troca de e-mail, com o 23505 do Postgres. */
function isDuplicateEmail(error: { code?: string; status?: number } | null) {
  return error?.code === "email_exists" || error?.code === "23505" || error?.status === 422;
}

const loginTaken = "Esse usuário já está em uso. Escolha outro.";
/** O vínculo local aponta para um login de outra loja ou de outro tipo: não mexe no Auth. */
const foreignLogin = "O login deste barbeiro não pertence a esta barbearia.";

export async function createBarberAccessAction(
  professionalId: string,
  login: string,
  password: string,
): Promise<SiteActionResult> {
  if (typeof login !== "string" || typeof password !== "string") return failure("Revise o usuário e a senha.");
  const loginProblem = validateStaffLogin(login);
  if (loginProblem) return failure(`Usuário: ${loginProblem}`);
  const passwordProblem = validateStaffPassword(password);
  if (passwordProblem) return failure(`Senha: ${passwordProblem}`);

  const auth = await requireAdminFor(professionalId);
  if ("error" in auth) return auth.error;
  const { supabase, shopId, admin, professional } = auth;

  if (await getBarberLogin(supabase, professional.id)) {
    return failure("Este barbeiro já tem acesso. Use Alterar usuário ou Redefinir senha.");
  }

  const normalized = normalizeStaffLogin(login);
  if (await isLoginTaken(supabase, normalized, null)) return failure(loginTaken);
  const created = await admin.auth.admin.createUser({
    email: getStaffLoginEmail(normalized, shopId),
    password,
    email_confirm: true,
    app_metadata: identityMetadata(shopId, "equipe"),
  });
  if (created.error || !created.data.user) {
    return isDuplicateEmail(created.error)
      ? failure(loginTaken)
      : failure("Não foi possível criar o acesso. Tente novamente.");
  }

  const { error } = await supabase.from("staff_members").insert({
    user_id: created.data.user.id,
    role: "barbeiro",
    professional_id: professional.id,
    display_name: professional.name,
    login: normalized,
    is_active: true,
  });
  if (error) {
    await admin.auth.admin.deleteUser(created.data.user.id);
    return error.code === "23505" ? failure(loginTaken) : failure("Não foi possível ligar o acesso ao barbeiro. Nada foi criado.");
  }

  return { ok: true, message: `Acesso de ${professional.name} criado. Passe o usuário e a senha a ele.` };
}

export async function updateBarberLoginAction(professionalId: string, login: string): Promise<SiteActionResult> {
  if (typeof login !== "string") return failure("Revise o usuário.");
  const loginProblem = validateStaffLogin(login);
  if (loginProblem) return failure(`Usuário: ${loginProblem}`);

  const auth = await requireAdminFor(professionalId);
  if ("error" in auth) return auth.error;
  const { supabase, shopId, admin, professional } = auth;

  const current = await getBarberLogin(supabase, professional.id);
  if (!current || current.role !== "barbeiro") return failure("Este barbeiro ainda não tem acesso.");

  const normalized = normalizeStaffLogin(login);
  if (current.login === normalized) return { ok: true, message: "O usuário já era esse." };
  if (await isLoginTaken(supabase, normalized, current.user_id)) return failure(loginTaken);
  if (!(await isShopIdentity(admin, current.user_id, shopId, "equipe"))) return failure(foreignLogin);

  const updated = await admin.auth.admin.updateUserById(current.user_id, {
    email: getStaffLoginEmail(normalized, shopId),
    email_confirm: true,
  });
  if (updated.error) {
    return isDuplicateEmail(updated.error)
      ? failure(loginTaken)
      : failure("Não foi possível trocar o usuário. Tente novamente.");
  }

  const { error } = await supabase.from("staff_members").update({ login: normalized }).eq("user_id", current.user_id);
  if (error) {
    // Volta o Auth para o usuário antigo: os dois continuam batendo.
    if (current.login) {
      await admin.auth.admin.updateUserById(current.user_id, { email: getStaffLoginEmail(current.login, shopId) });
    }
    return error.code === "23505" ? failure(loginTaken) : failure("Não foi possível trocar o usuário. Tente novamente.");
  }

  return { ok: true, message: `Usuário de ${professional.name} alterado para “${normalized}”.` };
}

export async function resetBarberPasswordAction(professionalId: string, password: string): Promise<SiteActionResult> {
  if (typeof password !== "string") return failure("Revise a nova senha.");
  const passwordProblem = validateStaffPassword(password);
  if (passwordProblem) return failure(`Senha: ${passwordProblem}`);

  const auth = await requireAdminFor(professionalId);
  if ("error" in auth) return auth.error;
  const { supabase, shopId, admin, professional } = auth;

  const current = await getBarberLogin(supabase, professional.id);
  if (!current || current.role !== "barbeiro") return failure("Este barbeiro ainda não tem acesso.");
  if (!(await isShopIdentity(admin, current.user_id, shopId, "equipe"))) return failure(foreignLogin);

  const updated = await admin.auth.admin.updateUserById(current.user_id, { password });
  if (updated.error) return failure("Não foi possível redefinir a senha. Tente novamente.");
  return { ok: true, message: `Senha de ${professional.name} redefinida. Passe a nova senha a ele.` };
}

export async function setBarberAccessActiveAction(professionalId: string, active: boolean): Promise<SiteActionResult> {
  if (typeof active !== "boolean") return failure("Pedido inválido.");

  const auth = await requireAdminFor(professionalId);
  if ("error" in auth) return auth.error;
  const { supabase, shopId, admin, professional } = auth;

  const current = await getBarberLogin(supabase, professional.id);
  if (!current || current.role !== "barbeiro") return failure("Este barbeiro ainda não tem acesso.");
  if (!(await isShopIdentity(admin, current.user_id, shopId, "equipe"))) return failure(foreignLogin);

  // Primeiro o banco (corta o acesso aos dados na hora), depois o Auth (login e renovação).
  const { error } = await supabase.from("staff_members").update({ is_active: active }).eq("user_id", current.user_id);
  if (error) return failure("Não foi possível alterar o acesso. Tente novamente.");

  const banned = await admin.auth.admin.updateUserById(current.user_id, { ban_duration: active ? "none" : banForever });
  if (banned.error) {
    await supabase.from("staff_members").update({ is_active: current.is_active }).eq("user_id", current.user_id);
    return failure("Não foi possível alterar o acesso. Tente novamente.");
  }

  return {
    ok: true,
    message: active
      ? `Acesso de ${professional.name} reativado.`
      : `Acesso de ${professional.name} desativado. Atendimentos e histórico continuam.`,
  };
}
