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
import { getSlotFolder, isSiteImageSlot, validateSiteImage, type SiteImageSlot } from "../data/site-images";
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

function refreshSite(tag: string = catalogTags.professionals) {
  // Landing e agendamento (cache por tag); o painel recarrega pelo router.refresh() do cliente.
  updateTag(tag);
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
    .is("deleted_at", null)
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
    .is("deleted_at", null)
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

  // Excluídos não entram na ordem de exibição.
  const { data: list, error } = await supabase
    .from("professionals")
    .select("id, name, sort_order")
    .is("deleted_at", null)
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
 * Exclui um profissional. Sem nenhuma ligação (atendimentos, bloqueios de agenda, login),
 * a linha é apagada de vez. Com histórico, a exclusão é lógica: deleted_at + inativo. Some
 * do site, do agendamento e das listas do painel, mas atendimentos, bloqueios e fechamentos
 * continuam apontando para ele (a FK "restrict" de appointments impede apagar a linha). O
 * login de barbeiro ligado a ele perde o acesso ao painel. Horários futuros não são
 * cancelados: ficam na agenda para o admin decidir.
 */
export async function deleteProfessionalAction(id: string): Promise<SiteActionResult> {
  if (!isUuid(id)) return failure("Profissional não encontrado. Recarregue a página.");
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: professional } = await supabase
    .from("professionals")
    .select("name, image_url, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (!professional || professional.deleted_at) return failure("Profissional não encontrado. Recarregue a página.");

  const [appointments, blocks, logins] = await Promise.all([
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .or(`booked_professional_id.eq.${id},performed_by_id.eq.${id}`),
    supabase.from("schedule_blocks").select("id", { count: "exact", head: true }).eq("professional_id", id),
    supabase.from("staff_members").select("user_id", { count: "exact", head: true }).eq("professional_id", id),
  ]);
  if (appointments.error || blocks.error || logins.error) {
    return failure("Não foi possível conferir o histórico. Nada foi excluído.");
  }
  const hasHistory = (appointments.count ?? 0) + (blocks.count ?? 0) + (logins.count ?? 0) > 0;

  if (!hasHistory) {
    const { data: deleted, error } = await supabase.from("professionals").delete().eq("id", id).select("id");
    // Histórico criado entre a conferência e o delete (FK): cai na exclusão lógica abaixo.
    if (!error && deleted?.length) {
      refreshSite();
      await removeObject(supabase, getSiteMediaPath(professional.image_url, supabaseUrl, "barbers"));
      return { ok: true, message: `${professional.name} foi excluído.` };
    }
    if (error?.code !== "23503") return failure("Não foi possível excluir. Tente novamente.");
  }

  // Primeiro tira o acesso ao painel (se houver); só então marca como excluído. Login de
  // barbeiro perde o acesso; um admin ligado ao profissional só perde o vínculo (nunca o
  // próprio acesso de administrador).
  if ((logins.count ?? 0) > 0) {
    const [barberLogins, adminLinks] = await Promise.all([
      supabase.from("staff_members").delete().eq("professional_id", id).eq("role", "barbeiro"),
      supabase.from("staff_members").update({ professional_id: null }).eq("professional_id", id).eq("role", "admin"),
    ]);
    if (barberLogins.error || adminLinks.error) {
      return failure("Não foi possível remover o acesso ao painel. Nada foi excluído.");
    }
  }

  const { data: archived, error } = await supabase
    .from("professionals")
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error || !archived?.length) return failure("Não foi possível excluir. Tente novamente.");

  // A foto fica: o fechamento dos períodos em que ele atendeu ainda mostra o avatar.
  refreshSite();
  return {
    ok: true,
    message: `${professional.name} foi excluído. Os atendimentos e fechamentos dele continuam no painel.`,
  };
}

// --- Edição do site > Imagens (galeria e foto da barbearia) ---

export type SaveSiteImageInput = {
  slot: SiteImageSlot;
  label: string;
  alt: string;
  imagePositionY: number;
  /** URL pública da imagem recém-enviada ao bucket, ou null para manter a atual. */
  newImageUrl: string | null;
};

/**
 * Grava imagem, legenda, texto alternativo e enquadramento de uma posição fixa. Mesmo
 * fluxo dos barbeiros: a imagem nova já está no bucket; se o banco recusar, ela é apagada e
 * a antiga continua valendo; se gravar, a antiga é apagada (só se for nossa no bucket —
 * as imagens originais em /public nunca são apagadas).
 */
export async function saveSiteImageAction(input: SaveSiteImageInput): Promise<SiteActionResult> {
  if (
    !isSiteImageSlot(input?.slot) ||
    typeof input.label !== "string" ||
    typeof input.alt !== "string" ||
    typeof input.imagePositionY !== "number" ||
    (input.newImageUrl !== null && typeof input.newImageUrl !== "string")
  ) {
    return failure("Revise os dados da imagem.");
  }
  const folder = getSlotFolder(input.slot);
  const newImagePath = getSiteMediaPath(input.newImageUrl, supabaseUrl, folder);

  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  async function abort(message: string) {
    await removeObject(supabase, newImagePath);
    return failure(message);
  }

  if (input.newImageUrl && !newImagePath) return abort("A imagem enviada não é válida. Escolha o arquivo de novo.");
  if (Object.keys(validateSiteImage(input)).length) return abort("Revise a legenda e a descrição da imagem.");

  const { data: current, error: currentError } = await supabase
    .from("site_images")
    .select("image_url")
    .eq("slot", input.slot)
    .maybeSingle();
  if (currentError || !current) return abort("Imagem não encontrada. Recarregue a página.");

  const { data: updated, error } = await supabase
    .from("site_images")
    .update({
      label: input.label.trim(),
      alt: input.alt.trim(),
      image_position: toImagePosition(input.imagePositionY),
      ...(input.newImageUrl ? { image_url: input.newImageUrl } : {}),
    })
    .eq("slot", input.slot)
    .select("slot");
  if (error || !updated?.length) return abort("Não foi possível salvar a imagem. A imagem atual continua no site.");

  refreshSite(catalogTags.siteImages);

  if (input.newImageUrl) {
    const oldPath = getSiteMediaPath(current.image_url, supabaseUrl, folder);
    if (!(await removeObject(supabase, oldPath))) {
      return { ok: true, message: "Imagem salva. A versão antiga não pôde ser removida do armazenamento." };
    }
    return { ok: true, message: "Imagem substituída. O site já mostra a nova versão." };
  }
  return { ok: true, message: "Alterações da imagem salvas." };
}
