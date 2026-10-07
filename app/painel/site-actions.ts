"use server";

import "server-only";
import { updateTag } from "next/cache";
import {
  createSlug,
  getDefaultImageAlt,
  toImagePosition,
  validateProfessional,
  type ProfessionalInput,
} from "../data/professionals";
import { getSiteMediaPath, siteMediaBucket } from "../data/site-media";
import { catalogTags } from "../lib/catalog";
import { supabaseUrl } from "../lib/supabase/env";
import { getSupabaseServerClient } from "../lib/supabase/server";

// Edição do site > Barbeiros. Tudo roda com a sessão do próprio admin (cookie): a RLS
// de professionals/professional_services e as políticas do bucket site-media conferem
// de novo no banco. Nenhuma chave secreta é usada aqui. Devolvem um resultado em vez de
// lançar, porque erros de Server Action chegam mascarados ao navegador em produção.
//
// Troca de foto: o navegador envia a foto nova ao Storage e só então chama a ação. A
// ação grava a URL nova; se o banco recusar, apaga a foto recém-enviada (a antiga segue
// valendo). Só depois de gravar apaga a foto antiga, e só se for nossa no bucket.

export type SiteActionResult = { ok: true; message: string } | { ok: false; message: string };

type Supabase = Awaited<ReturnType<typeof getSupabaseServerClient>>;

function failure(message: string): SiteActionResult {
  return { ok: false, message };
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids chegam do navegador: só uuid entra nos filtros do banco. */
function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

async function requireAdmin(): Promise<{ supabase: Supabase } | { error: SiteActionResult }> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { error: failure("Sua sessão terminou. Entre novamente no painel.") };

  const { data: staff } = await supabase.from("staff_members").select("role").eq("user_id", userId).maybeSingle();
  if (staff?.role !== "admin") return { error: failure("Só o administrador edita o conteúdo do site.") };
  return { supabase };
}

async function removeObject(supabase: Supabase, path: string | null) {
  if (!path) return true;
  const { error } = await supabase.storage.from(siteMediaBucket).remove([path]);
  return !error;
}

function refreshSite() {
  // Landing e agendamento (cache por tag); o painel recarrega pelo router.refresh() do cliente.
  updateTag(catalogTags.professionals);
}

export type SaveProfessionalInput = ProfessionalInput & {
  /** null = novo cadastro. */
  id: string | null;
  /** URL pública da foto recém-enviada ao bucket, ou null para manter a atual. */
  newImageUrl: string | null;
};

export async function saveProfessionalAction(input: SaveProfessionalInput): Promise<SiteActionResult> {
  if (
    typeof input?.name !== "string" ||
    typeof input.specialty !== "string" ||
    typeof input.description !== "string" ||
    typeof input.imagePositionY !== "number" ||
    (input.newImageUrl !== null && typeof input.newImageUrl !== "string")
  ) {
    return failure("Revise os dados do profissional.");
  }
  const newImagePath = getSiteMediaPath(input.newImageUrl, supabaseUrl, "barbers");

  const auth = await requireAdmin();
  if ("error" in auth) {
    return auth.error;
  }
  const { supabase } = auth;

  // Daqui para frente, qualquer recusa descarta a foto recém-enviada.
  async function abort(message: string) {
    await removeObject(supabase, newImagePath);
    return failure(message);
  }

  if (input.id !== null && !isUuid(input.id)) return abort("Profissional não encontrado. Recarregue a página.");
  if (input.newImageUrl && !newImagePath) return abort("A foto enviada não é válida. Escolha a imagem de novo.");
  if (Object.keys(validateProfessional(input)).length) return abort("Revise os dados do profissional.");

  const name = input.name.trim();
  const fields = {
    name,
    specialty: input.specialty.trim() || null,
    description: input.description.trim() || null,
    image_position: toImagePosition(input.imagePositionY),
  };

  if (input.id === null) {
    const { data: existing, error: listError } = await supabase.from("professionals").select("slug, sort_order");
    if (listError) return abort("Não foi possível conferir a equipe. Tente novamente.");

    const slug = createSlug(name, existing.map((row) => row.slug));
    const sortOrder = Math.max(0, ...existing.map((row) => row.sort_order)) + 1;
    const { data: created, error } = await supabase
      .from("professionals")
      .insert({
        ...fields,
        slug,
        sort_order: sortOrder,
        image_url: input.newImageUrl,
        image_alt: input.newImageUrl ? getDefaultImageAlt(name) : null,
      })
      .select("id")
      .single();
    if (error || !created) return abort("Não foi possível cadastrar o profissional. Tente novamente.");

    // Como os atuais, o novo profissional atende todos os serviços ativos.
    const { data: activeServices, error: servicesError } = await supabase
      .from("services")
      .select("id")
      .eq("is_active", true);
    const { error: linkError } = servicesError
      ? { error: servicesError }
      : await supabase
          .from("professional_services")
          .insert(activeServices.map((service) => ({ professional_id: created.id, service_id: service.id })));
    if (linkError) {
      // Sem serviços ele não poderia ser agendado: desfaz o cadastro (ainda não tem histórico).
      await supabase.from("professionals").delete().eq("id", created.id);
      return abort("Não foi possível ligar o profissional aos serviços. Nada foi salvo; tente novamente.");
    }

    refreshSite();
    return { ok: true, message: `${name} foi adicionado à equipe.` };
  }

  const { data: current, error: currentError } = await supabase
    .from("professionals")
    .select("name, image_url, image_alt")
    .eq("id", input.id)
    .maybeSingle();
  if (currentError || !current) return abort("Profissional não encontrado. Recarregue a página.");

  // Texto alternativo: foto nova ganha o padrão; com a mesma foto, acompanha a troca de nome.
  const imageAlt = input.newImageUrl
    ? getDefaultImageAlt(name)
    : current.image_alt && current.name !== name
      ? current.image_alt.replaceAll(current.name, name)
      : current.image_alt;

  const { data: updated, error } = await supabase
    .from("professionals")
    .update({ ...fields, image_alt: imageAlt, ...(input.newImageUrl ? { image_url: input.newImageUrl } : {}) })
    .eq("id", input.id)
    .select("id");
  if (error || !updated?.length) return abort("Não foi possível salvar as alterações. Tente novamente.");

  refreshSite();

  // Banco gravado: a foto antiga (se era nossa no bucket) não é mais usada.
  if (input.newImageUrl) {
    const oldPath = getSiteMediaPath(current.image_url, supabaseUrl, "barbers");
    if (!(await removeObject(supabase, oldPath))) {
      return { ok: true, message: `Dados de ${name} salvos. A foto antiga não pôde ser removida do armazenamento.` };
    }
  }
  return { ok: true, message: `Dados de ${name} salvos.` };
}

export async function setProfessionalActiveAction(id: string, active: boolean): Promise<SiteActionResult> {
  if (!isUuid(id) || typeof active !== "boolean") return failure("Profissional não encontrado. Recarregue a página.");
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("professionals")
    .update({ is_active: active })
    .eq("id", id)
    .select("name");
  if (error || !data?.length) return failure("Não foi possível mudar o status. Tente novamente.");

  refreshSite();
  return {
    ok: true,
    message: active
      ? `${data[0].name} voltou a aparecer no site e no agendamento.`
      : `${data[0].name} saiu do site e do agendamento. O histórico continua no painel.`,
  };
}

/** Troca a posição com o vizinho (na ordem de exibição). */
export async function moveProfessionalAction(id: string, direction: -1 | 1): Promise<SiteActionResult> {
  if (!isUuid(id) || (direction !== -1 && direction !== 1)) return failure("Profissional não encontrado.");
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: list, error } = await supabase
    .from("professionals")
    .select("id, name, sort_order")
    .order("sort_order")
    .order("name");
  if (error) return failure("Não foi possível carregar a ordem. Tente novamente.");

  const index = list.findIndex((row) => row.id === id);
  const neighbor = list[index + direction];
  if (index === -1 || !neighbor) return { ok: true, message: "" };

  // Renumera a lista inteira (1, 2, 3…) com os dois trocados: funciona mesmo com ordens repetidas.
  const reordered = [...list];
  [reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]];
  const changes = reordered
    .map((row, position) => ({ id: row.id, sort_order: position + 1, previous: row.sort_order }))
    .filter((row) => row.sort_order !== row.previous);

  for (const change of changes) {
    const { error: updateError } = await supabase
      .from("professionals")
      .update({ sort_order: change.sort_order })
      .eq("id", change.id);
    if (updateError) {
      refreshSite();
      return failure("A ordem foi salva só em parte. Confira a lista e tente de novo.");
    }
  }

  refreshSite();
  return { ok: true, message: `${list[index].name} ${direction === -1 ? "subiu" : "desceu"} na ordem de exibição.` };
}

/**
 * Apaga de vez um cadastro sem nenhuma ligação: sem atendimentos, bloqueios de agenda nem
 * login de barbeiro. Quem tem histórico só pode ser inativado. A FK "restrict" de
 * appointments segura qualquer corrida entre a conferência e o delete.
 */
export async function deleteProfessionalAction(id: string): Promise<SiteActionResult> {
  if (!isUuid(id)) return failure("Profissional não encontrado. Recarregue a página.");
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: professional } = await supabase
    .from("professionals")
    .select("name, image_url")
    .eq("id", id)
    .maybeSingle();
  if (!professional) return failure("Profissional não encontrado. Recarregue a página.");

  const [appointments, blocks, logins] = await Promise.all([
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .or(`booked_professional_id.eq.${id},performed_by_id.eq.${id}`),
    supabase.from("schedule_blocks").select("id", { count: "exact", head: true }).eq("professional_id", id),
    supabase.from("staff_members").select("user_id", { count: "exact", head: true }).eq("professional_id", id),
  ]);
  if (appointments.error || blocks.error || logins.error) {
    return failure("Não foi possível conferir o histórico. Nada foi apagado.");
  }
  if ((appointments.count ?? 0) + (blocks.count ?? 0) + (logins.count ?? 0) > 0) {
    return failure(`${professional.name} tem histórico na agenda. Use “Inativar” para tirar do site.`);
  }

  const { data: deleted, error } = await supabase.from("professionals").delete().eq("id", id).select("id");
  if (error || !deleted?.length) {
    return failure(
      error?.code === "23503"
        ? `${professional.name} tem histórico na agenda. Use “Inativar” para tirar do site.`
        : "Não foi possível excluir. Tente novamente.",
    );
  }

  refreshSite();
  await removeObject(supabase, getSiteMediaPath(professional.image_url, supabaseUrl, "barbers"));
  return { ok: true, message: `${professional.name} foi excluído.` };
}
