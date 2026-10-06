"use server";

import "server-only";
import { isPlanId, type PlanId } from "../data/plans";
import {
  getSubscriberLoginEmail,
  normalizePhone,
  subscriptionStatuses,
  validateSubscriberName,
  validateSubscriberPassword,
  validateSubscriberPhone,
  type SubscriptionStatus,
} from "../data/subscribers";
import { getSupabaseAdminClient } from "../lib/supabase/admin";
import { getRpcMessage, type RpcError } from "../lib/supabase/errors";
import { getSupabaseServerClient } from "../lib/supabase/server";

// Ações do painel que precisam da chave secreta (criar login e trocar senha no Supabase
// Auth). Cada uma confere que quem chama é admin; o cadastro em si passa pelas RPCs
// save_subscriber e set_subscription com a sessão do próprio admin, então o banco
// confere de novo. Devolvem um resultado em vez de lançar: erros de Server Action
// chegam mascarados ao navegador em produção.

export type SubscriberActionReason = "phone_in_use" | "not_found" | "invalid_request" | "not_allowed" | "not_configured";

export type SubscriberActionResult =
  | { ok: true; id: string }
  | { ok: false; reason: SubscriberActionReason; message: string };

const missingSecret =
  "Configure a SUPABASE_SECRET_KEY (.env.local e Vercel) para criar logins e trocar senhas de assinantes.";

function failure(reason: SubscriberActionReason, message: string): SubscriberActionResult {
  return { ok: false, reason, message };
}

function fromRpc(error: RpcError, fallback: string): SubscriberActionResult {
  if (error.message === "phone_in_use") return failure("phone_in_use", getRpcMessage(error, fallback));
  if (error.message === "subscriber_not_found") return failure("not_found", getRpcMessage(error, fallback));
  if (error.code === "42501") return failure("not_allowed", "Só o administrador gerencia assinantes.");
  return failure("invalid_request", getRpcMessage(error, fallback));
}

/** Sessão do admin (cookie) ou o motivo de recusa. */
async function requireAdmin() {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { error: failure("not_allowed", "Sua sessão terminou. Entre novamente no painel.") };

  const { data: staff } = await supabase.from("staff_members").select("role").eq("user_id", userId).maybeSingle();
  if (staff?.role !== "admin") return { error: failure("not_allowed", "Só o administrador gerencia assinantes.") };
  return { supabase };
}

export async function createSubscriberAction(input: {
  name: string;
  phone: string;
  password: string;
  planId: PlanId;
  status: SubscriptionStatus;
}): Promise<SubscriberActionResult> {
  if (
    validateSubscriberName(input.name) ||
    validateSubscriberPhone(input.phone) ||
    validateSubscriberPassword(input.password) ||
    !isPlanId(input.planId) ||
    !subscriptionStatuses.includes(input.status)
  ) {
    return failure("invalid_request", "Revise os dados do assinante.");
  }

  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const admin = getSupabaseAdminClient();
  if (!admin) return failure("not_configured", missingSecret);

  const created = await admin.auth.admin.createUser({
    email: getSubscriberLoginEmail(input.phone),
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name.trim(), kind: "assinante" },
  });
  if (created.error || !created.data.user) {
    return created.error?.code === "email_exists"
      ? failure("phone_in_use", "Já existe um assinante com este telefone.")
      : failure("invalid_request", "Não foi possível criar o login. Tente novamente.");
  }
  const userId = created.data.user.id;

  const saved = await auth.supabase.rpc("save_subscriber", {
    p_customer_id: null,
    p_name: input.name,
    p_phone: input.phone,
    p_user_id: userId,
  });
  if (saved.error) {
    await admin.auth.admin.deleteUser(userId);
    return fromRpc(saved.error, "Não foi possível salvar o assinante.");
  }

  const customerId = saved.data as string;
  const subscription = await auth.supabase.rpc("set_subscription", {
    p_customer_id: customerId,
    p_plan: input.planId,
    p_status: input.status,
  });
  if (subscription.error) return fromRpc(subscription.error, "Assinante salvo, mas o plano não foi aplicado.");

  return { ok: true, id: customerId };
}

async function getLoginUserId(supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>, customerId: string) {
  const { data } = await supabase.from("customers").select("user_id, phone").eq("id", customerId).maybeSingle();
  return data;
}

export async function updateSubscriberAction(
  id: string,
  changes: { name: string; phone: string },
): Promise<SubscriberActionResult> {
  if (validateSubscriberName(changes.name) || validateSubscriberPhone(changes.phone)) {
    return failure("invalid_request", "Revise os dados do assinante.");
  }

  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const current = await getLoginUserId(auth.supabase, id);
  if (!current) return failure("not_found", "Assinante não encontrado.");

  // O telefone é o login: se mudou, o e-mail interno do Auth muda junto.
  const phoneChanged = current.phone !== normalizePhone(changes.phone);
  const admin = phoneChanged && current.user_id ? getSupabaseAdminClient() : null;
  if (phoneChanged && current.user_id) {
    if (!admin) return failure("not_configured", missingSecret);
    const updated = await admin.auth.admin.updateUserById(current.user_id, {
      email: getSubscriberLoginEmail(changes.phone),
      email_confirm: true,
    });
    if (updated.error) {
      return updated.error.code === "email_exists"
        ? failure("phone_in_use", "Já existe um assinante com este telefone.")
        : failure("invalid_request", "Não foi possível atualizar o login. Tente novamente.");
    }
  }

  const saved = await auth.supabase.rpc("save_subscriber", {
    p_customer_id: id,
    p_name: changes.name,
    p_phone: changes.phone,
    p_user_id: null,
  });
  if (saved.error) {
    if (admin && current.user_id) {
      await admin.auth.admin.updateUserById(current.user_id, { email: getSubscriberLoginEmail(current.phone) });
    }
    return fromRpc(saved.error, "Não foi possível salvar o assinante.");
  }

  return { ok: true, id };
}

export async function resetSubscriberPasswordAction(id: string, password: string): Promise<SubscriberActionResult> {
  if (validateSubscriberPassword(password)) return failure("invalid_request", "Revise a nova senha.");

  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const admin = getSupabaseAdminClient();
  if (!admin) return failure("not_configured", missingSecret);

  const current = await getLoginUserId(auth.supabase, id);
  if (!current) return failure("not_found", "Assinante não encontrado.");

  if (!current.user_id) {
    // Assinante sem login (por exemplo, cadastrado antes): cria agora com esta senha.
    const created = await admin.auth.admin.createUser({
      email: getSubscriberLoginEmail(current.phone),
      password,
      email_confirm: true,
      user_metadata: { kind: "assinante" },
    });
    if (created.error || !created.data.user) {
      return failure("invalid_request", "Não foi possível criar o login. Tente novamente.");
    }
    const { error } = await auth.supabase.from("customers").update({ user_id: created.data.user.id }).eq("id", id);
    if (error) {
      await admin.auth.admin.deleteUser(created.data.user.id);
      return failure("invalid_request", "Não foi possível ligar o login ao assinante.");
    }
    return { ok: true, id };
  }

  const updated = await admin.auth.admin.updateUserById(current.user_id, { password });
  if (updated.error) return failure("invalid_request", "Não foi possível trocar a senha. Tente novamente.");
  return { ok: true, id };
}
