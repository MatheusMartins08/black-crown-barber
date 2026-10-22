// Cadastra uma barbearia nova (só depois da etapa 4, …_multi_tenant_release.sql):
//   1. provision_shop: loja, configurações, imagens de exemplo, expediente padrão e domínio;
//   2. o primeiro admin no Supabase Auth (e-mail real; a senha é digitada aqui, sem eco);
//   3. provision_shop_admin: liga o admin à loja.
// Retomável: cada passo reconhece o que já existe, então rodar de novo depois de uma falha
// completa o que faltou. Um usuário que já é de outra barbearia faz o script parar.
//
// Uso (na raiz do projeto, com SUPABASE_SECRET_KEY no .env.local):
//   node --env-file=.env.local scripts/provision-shop.mjs \
//     --slug barbearia-exemplo --name "Barbearia Exemplo" --admin-email dono@exemplo.com \
//     [--timezone America/Sao_Paulo] [--host exemplo.suaplataforma.com.br] [--admin-name "Nome"]

import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    slug: { type: "string" },
    name: { type: "string" },
    timezone: { type: "string", default: "America/Sao_Paulo" },
    host: { type: "string" },
    "admin-email": { type: "string" },
    "admin-name": { type: "string" },
  },
});

if (!values.slug || !values.name || !values["admin-email"]) {
  console.error("Informe --slug, --name e --admin-email (veja o cabeçalho do script).");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY (node --env-file=.env.local ...).");
  process.exit(1);
}
const supabase = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const adminEmail = values["admin-email"].trim().toLowerCase();

/** Lê a senha sem mostrar o que é digitado. */
function askPassword(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => {
      if (text.includes(prompt)) process.stdout.write(text);
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function findUserByEmail(email) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Não foi possível listar os usuários: ${error.message}`);
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user || data.users.length < 1000) return user ?? null;
  }
}

// 1. Loja
const shop = await supabase.rpc("provision_shop", {
  p_slug: values.slug,
  p_name: values.name,
  p_timezone: values.timezone,
  p_host: values.host ?? null,
});
if (shop.error) {
  console.error(`Não foi possível criar a barbearia: ${shop.error.hint ?? shop.error.message}`);
  process.exit(1);
}
const shopId = shop.data;
console.log(`Barbearia pronta: ${values.slug} (${shopId}).`);

// 2. Admin no Auth
// O dono do login (app_metadata, só o servidor grava) é o que o banco confere ao ligar o login
// à equipe (…20261022150000_identity_binding_and_consent.sql).
const identity = { shop_id: shopId, kind: "equipe" };
let user = await findUserByEmail(adminEmail);
if (user) {
  const owner = user.app_metadata ?? {};
  if (owner.shop_id && (owner.shop_id !== shopId || owner.kind !== "equipe")) {
    console.error("Este e-mail já é login de outra barbearia ou de um assinante. Use outro e-mail.");
    process.exit(1);
  }
  if (!owner.shop_id) {
    const tagged = await supabase.auth.admin.updateUserById(user.id, { app_metadata: identity });
    if (tagged.error) {
      console.error(`Não foi possível marcar o login com a barbearia: ${tagged.error.message}`);
      process.exit(1);
    }
  }
  console.log("O e-mail do admin já tem login: a senha atual continua valendo.");
} else {
  const password = await askPassword("Senha do admin (mínimo 8 caracteres): ");
  if (password.length < 8 || password.length > 72) {
    console.error("A senha precisa ter de 8 a 72 caracteres. Nada foi criado no Auth; rode de novo.");
    process.exit(1);
  }
  const created = await supabase.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
    app_metadata: identity,
  });
  if (created.error || !created.data.user) {
    console.error(`Não foi possível criar o login do admin: ${created.error?.message ?? "erro desconhecido"}`);
    process.exit(1);
  }
  user = created.data.user;
  console.log("Login do admin criado.");
}

// 3. Vínculo do admin com a loja
const link = await supabase.rpc("provision_shop_admin", {
  p_shop: shopId,
  p_user_id: user.id,
  p_display_name: values["admin-name"] ?? null,
});
if (link.error) {
  console.error(`Não foi possível ligar o admin à barbearia: ${link.error.hint ?? link.error.message}`);
  process.exit(1);
}

console.log("Pronto. O admin entra em /painel/entrar no domínio da barbearia com o e-mail e a senha.");
if (!values.host) console.log("Sem --host: cadastre o domínio rodando o script de novo com --host.");
