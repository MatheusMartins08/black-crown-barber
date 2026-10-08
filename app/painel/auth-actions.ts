"use server";

import "server-only";
import { redirect, RedirectType } from "next/navigation";
import { toStaffAuthEmail } from "../data/staff";
import { getSupabaseServerClient } from "../lib/supabase/server";
import { staffHome, type StaffRole } from "./lib/staff";

// Entrada e saída do painel no servidor. O login grava a sessão nos cookies da própria
// resposta e termina com redirect() para a tela do papel: gravar cookies numa Server Action
// invalida o cache do roteador do navegador. Antes o login era feito no navegador e seguido de
// router.replace("/painel"), que reaproveitava o prefetch de /painel feito ainda sem sessão
// (um redirect para /painel/entrar) e "recarregava" a tela de login em produção.

export type SignInResult = { ok: false; message: string };

const invalidCredentials = "Usuário ou senha incorretos.";

export async function signInStaffAction(identifier: string, password: string): Promise<SignInResult> {
  if (typeof identifier !== "string" || typeof password !== "string" || !identifier.trim() || !password) {
    return { ok: false, message: "Informe o usuário (ou e-mail) e a senha." };
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: toStaffAuthEmail(identifier),
    password,
  });

  if (error || !data.user) {
    if (error?.code === "user_banned") {
      return { ok: false, message: "Acesso desativado. Fale com o administrador da barbearia." };
    }
    return {
      ok: false,
      message:
        error?.status === 429 ? "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo." : invalidCredentials,
    };
  }

  const { data: staff } = await supabase
    .from("staff_members")
    .select("role, is_active")
    .eq("user_id", data.user.id)
    .maybeSingle();

  // Login de assinante ou fora da equipe, ou acesso desativado: não fica logado no painel.
  if (!staff || !staff.is_active) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      ok: false,
      message: staff ? "Acesso desativado. Fale com o administrador da barbearia." : invalidCredentials,
    };
  }

  // replace: o "voltar" do navegador não leva de novo à tela de login.
  redirect(staffHome[staff.role as StaffRole], RedirectType.replace);
}

export async function signOutStaffAction() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/painel/entrar", RedirectType.replace);
}
