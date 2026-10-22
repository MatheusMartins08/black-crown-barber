// Etapa 3 do multi-tenant: troca os e-mails internos de login da Black Crown para o formato com
// a loja, sem mudar o UUID nem a senha de ninguém:
//   rafael@equipe.blackcrown.app            -> rafael@<shopId>.equipe.blackcrown.app
//   31999998888@assinantes.blackcrown.app   -> 31999998888@<shopId>.assinantes.blackcrown.app
// Contas com e-mail real (admin) não mudam. O app aceita os dois formatos no login desde a etapa 1.
//
// Uso (na raiz do projeto, com SUPABASE_SECRET_KEY no .env.local):
//   node --env-file=.env.local scripts/migrate-auth-emails.mjs            simulação: só contagens
//   node --env-file=.env.local scripts/migrate-auth-emails.mjs --apply    aplica
//   node --env-file=.env.local scripts/migrate-auth-emails.mjs --revert [--apply]   caminho inverso
// Idempotente: rodar de novo não muda quem já está no formato de destino. Não imprime e-mails.

import { createClient } from "@supabase/supabase-js";

const legacyShopId = "b1ac0c00-0000-4000-8000-000000000001";
const apply = process.argv.includes("--apply");
const revert = process.argv.includes("--revert");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY (node --env-file=.env.local ...).");
  process.exit(1);
}
const supabase = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });

const domains = ["equipe.blackcrown.app", "assinantes.blackcrown.app"];
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const legacyPattern = new RegExp(`^([^@]+)@(${domains.map(escaped).join("|")})$`);
const scopedPattern = new RegExp(`^([^@]+)@${escaped(legacyShopId)}\\.(${domains.map(escaped).join("|")})$`);

async function listAllUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Não foi possível listar os usuários: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

/** Usuários ligados à Black Crown (equipe ou assinante). Só eles têm o formato antigo. */
async function legacyShopUserIds() {
  const [staff, customers] = await Promise.all([
    supabase.from("staff_members").select("user_id").eq("shop_id", legacyShopId),
    supabase.from("customers").select("user_id").eq("shop_id", legacyShopId).not("user_id", "is", null),
  ]);
  if (staff.error || customers.error) {
    throw new Error("Não foi possível ler staff_members/customers. A etapa 2 (multi_tenant_expand) já foi aplicada?");
  }
  return new Set([...staff.data, ...customers.data].map((row) => row.user_id));
}

const [users, owned] = await Promise.all([listAllUsers(), legacyShopUserIds()]);
const plan = [];
let skippedOtherShop = 0;
for (const user of users) {
  const email = (user.email ?? "").toLowerCase();
  const match = (revert ? scopedPattern : legacyPattern).exec(email);
  if (!match) continue;
  if (!owned.has(user.id)) {
    skippedOtherShop++;
    continue;
  }
  const [, local, domain] = match;
  plan.push({ id: user.id, email: revert ? `${local}@${domain}` : `${local}@${legacyShopId}.${domain}` });
}

console.log(`${revert ? "Reversão" : "Migração"}: ${plan.length} conta(s) a alterar; ${skippedOtherShop} ignorada(s) (sem vínculo com a Black Crown).`);
if (!apply) {
  console.log("Simulação: nada foi alterado. Rode de novo com --apply para aplicar.");
  process.exit(0);
}

let failed = 0;
for (const item of plan) {
  const { error } = await supabase.auth.admin.updateUserById(item.id, { email: item.email, email_confirm: true });
  if (error) {
    failed++;
    console.error(`Falhou para o usuário ${item.id}: ${error.message}`);
  }
}
console.log(`Concluído: ${plan.length - failed} alterada(s), ${failed} com erro.`);
process.exit(failed ? 1 : 0);
