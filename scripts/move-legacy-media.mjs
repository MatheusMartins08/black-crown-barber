// Pré-requisito da etapa 5 do multi-tenant (…_multi_tenant_cleanup.sql): leva as fotos enviadas
// antes do multi-tenant para a pasta da Black Crown no bucket, sem tirar nada do ar:
//   site-media/barbers/<uuid>.webp  ->  site-media/<shopId>/barbers/<uuid>.webp
// Para cada foto: copia, troca a URL em professionals.image_url e site_images.image_url e só
// então apaga o original. Retomável: se parar no meio, rodar de novo completa o que faltou.
//
// Uso (na raiz do projeto, com SUPABASE_SECRET_KEY no .env.local):
//   node --env-file=.env.local scripts/move-legacy-media.mjs           simulação: só mostra o plano
//   node --env-file=.env.local scripts/move-legacy-media.mjs --apply   aplica

import { createClient } from "@supabase/supabase-js";

const legacyShopId = "b1ac0c00-0000-4000-8000-000000000001";
const bucket = "site-media";
const folders = ["barbers", "gallery", "barbershop"];
const apply = process.argv.includes("--apply");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY (node --env-file=.env.local ...).");
  process.exit(1);
}
const supabase = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const storage = supabase.storage.from(bucket);
const publicPrefix = `${url.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/`;

async function listFolder(path) {
  const { data, error } = await storage.list(path, { limit: 1000 });
  if (error) throw new Error(`Não foi possível listar ${path}/: ${error.message}`);
  // Subpastas vêm com id nulo.
  return data.filter((item) => item.id !== null).map((item) => item.name);
}

/** Troca a URL antiga pela nova nas tabelas que guardam fotos. Devolve quantas linhas mudaram. */
async function updateReferences(oldUrl, newUrl) {
  let changed = 0;
  for (const table of ["professionals", "site_images"]) {
    const query = supabase.from(table).update({ image_url: newUrl }).eq("image_url", oldUrl);
    if (!apply) {
      const { count, error } = await supabase.from(table).select("image_url", { count: "exact", head: true }).eq("image_url", oldUrl);
      if (error) throw new Error(`Não foi possível ler ${table}: ${error.message}`);
      changed += count ?? 0;
      continue;
    }
    const { data, error } = await query.select("image_url");
    if (error) throw new Error(`Não foi possível atualizar ${table}: ${error.message}`);
    changed += data.length;
  }
  return changed;
}

let moved = 0;
let failed = 0;
for (const folder of folders) {
  const legacy = await listFolder(folder);
  if (!legacy.length) continue;
  const already = new Set(await listFolder(`${legacyShopId}/${folder}`));

  for (const name of legacy) {
    const from = `${folder}/${name}`;
    const to = `${legacyShopId}/${folder}/${name}`;
    try {
      if (!already.has(name)) {
        if (apply) {
          const { error } = await storage.copy(from, to);
          if (error) throw new Error(`cópia: ${error.message}`);
        }
      }
      const references = await updateReferences(publicPrefix + from, publicPrefix + to);
      if (apply) {
        const { error } = await storage.remove([from]);
        if (error) throw new Error(`remoção do original: ${error.message}`);
      }
      moved++;
      console.log(`${apply ? "movida" : "a mover"}: ${from} -> ${to} (${references} referência(s) no banco)`);
    } catch (error) {
      failed++;
      console.error(`Falhou em ${from}: ${error.message}`);
    }
  }
}

console.log(`${apply ? "Concluído" : "Simulação"}: ${moved} foto(s)${failed ? `, ${failed} com erro` : ""}.`);
if (!apply) console.log("Nada foi alterado. Rode de novo com --apply para aplicar.");
process.exit(failed ? 1 : 0);
