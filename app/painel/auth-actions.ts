"use server";

import "server-only";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { toStaffAuthEmail } from "../data/staff";
import { getCurrentShop } from "../lib/shop";
import { getSupabaseServerClient } from "../lib/supabase/server";
import { staffHome, type StaffRole } from "./lib/staff";

// Entrada e saída do painel no servidor. A action só grava (ou apaga) a sessão nos cookies da
// própria resposta e devolve o destino; o navegador navega de verdade (location.replace).
//
// Sem redirect() aqui: numa Server Action ele renderiza o destino por um fetch interno para a
// origem do servidor (localhost no dev), que perde o domínio da loja. O layout não acha a
// barbearia e mostra "Página não encontrada" (ou o fetch trava resolvendo *.localhost).
// A navegação completa também não usa o cache do roteador: o router.replace antigo
// reaproveitava o prefetch de /painel feito sem sessão e "recarregava" a tela de login.

export type SignInResult = { ok: true; href: string } | { ok: false; message: string };

const invalidCredentials = "Usuário ou senha incorretos.";
const unavailable = "Não foi possível conectar agora. Verifique a conexão e tente de novo.";

export async function signInStaffAction(identifier: string, password: string): Promise<SignInResult> {
  if (typeof identifier !== "string" || typeof password !== "string" || !identifier.trim() || !password) {
    return { ok: false, message: "Informe o usuário (ou e-mail) e a senha." };
  }

  // O usuário do barbeiro vira um e-mail interno com a loja do domínio.
  const shop = await getCurrentShop();
  if (!shop) return { ok: false, message: invalidCredentials };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: toStaffAuthEmail(identifier, shop.id),
    password,
  });

  if (error || !data.user) {
    if (error?.code === "user_banned") {
      return { ok: false, message: "Acesso desativado. Fale com o administrador da barbearia." };
    }
    // Sem resposta do Supabase (rede, instabilidade): não é senha errada.
    if (isAuthRetryableFetchError(error) || (error?.status ?? 0) >= 500) return { ok: false, message: unavailable };
    return {
      ok: false,
      message:
        error?.status === 429 ? "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo." : invalidCredentials,
    };
  }

  const { data: staff, error: staffError } = await supabase
    .from("staff_members")
    .select("shop_id, role, is_active")
    .eq("user_id", data.user.id)
    .maybeSingle();

  // Falha ao ler o papel: não dá para saber para onde levar, então não fica logado.
  if (staffError) {
    await supabase.auth.signOut({ scope: "local" });
    return { ok: false, message: "Não foi possível verificar o seu acesso agora. Tente de novo em instantes." };
  }

  // Login de assinante, de outra barbearia ou fora da equipe, ou acesso desativado: não fica
  // logado no painel. Outra barbearia responde como senha errada (não revela que a conta existe).
  const ownShop = staff?.shop_id === shop.id;
  if (!staff || !ownShop || !staff.is_active || shop.status === "cancelada") {
    await supabase.auth.signOut({ scope: "local" });
    return {
      ok: false,
      message: staff && ownShop ? "Acesso desativado. Fale com o administrador da barbearia." : invalidCredentials,
    };
  }

  return { ok: true, href: staffHome[staff.role as StaffRole] };
}

export async function signOutStaffAction() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
}
