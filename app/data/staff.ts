// Login da equipe. O admin entra com o e-mail; o barbeiro, com um usuário simples ("rafael"),
// que no Supabase Auth vira um e-mail interno nunca exibido (mesma ideia do login do
// assinante em subscribers.ts). A senha fica só no Supabase Auth.
// Puro (sem React e sem rede): usado pela tela de login e pelas Server Actions.

export const staffLoginDomain = "equipe.blackcrown.app";

export const staffLoginRules = { minLength: 3, maxLength: 32 };
export const staffPasswordRules = { minLength: 8, maxLength: 72 };

const loginPattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/** " Rafael " -> "rafael". */
export function normalizeStaffLogin(value: string) {
  return value.trim().toLowerCase();
}

export function getStaffLoginEmail(login: string) {
  return `${normalizeStaffLogin(login)}@${staffLoginDomain}`;
}

/** O que foi digitado no login: com "@" é e-mail; sem, é o usuário do barbeiro. */
export function toStaffAuthEmail(identifier: string) {
  const value = identifier.trim();
  return value.includes("@") ? value.toLowerCase() : getStaffLoginEmail(value);
}

/** Problema no usuário (ou undefined). Mesma regra do check de staff_members.login. */
export function validateStaffLogin(value: string) {
  const login = normalizeStaffLogin(value);
  if (login.length < staffLoginRules.minLength) return `Use pelo menos ${staffLoginRules.minLength} caracteres.`;
  if (login.length > staffLoginRules.maxLength) return `Use até ${staffLoginRules.maxLength} caracteres.`;
  if (!loginPattern.test(login)) return "Use só letras minúsculas, números, ponto, hífen ou _, começando por letra ou número.";
  return undefined;
}

export function validateStaffPassword(password: string) {
  if (password.length < staffPasswordRules.minLength) return `Use pelo menos ${staffPasswordRules.minLength} caracteres.`;
  if (password.length > staffPasswordRules.maxLength) return `Use até ${staffPasswordRules.maxLength} caracteres.`;
  return undefined;
}
