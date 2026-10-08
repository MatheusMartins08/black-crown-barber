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
import {
  fitsSchedule,
  openingPeriodColumns,
  scheduleExceptionColumns,
  toOpeningPeriod,
  toScheduleException,
  validateException,
  validateWeek,
  type ExceptionInput,
  type OpeningPeriod,
  type OpeningPeriodRow,
  type ScheduleException,
  type ScheduleExceptionRow,
} from "../data/hours";
import { createPlanSlug, validatePlan, type PlanInput } from "../data/plans";
import { createServiceSlug, validateService, type ServiceInput } from "../data/services";
import { getSlotFolder, isSiteImageSlot, validateSiteImage, type SiteImageSlot } from "../data/site-images";
import { getSiteMediaPath, siteMediaBucket } from "../data/site-media";
import { serviceIconKeys } from "../components/service-icons";
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

/**
 * Troca a posição com o vizinho na ordem de exibição (professionals ou services). Renumera a
 * lista inteira (1, 2, 3…) com os dois trocados: funciona mesmo com ordens repetidas.
 * Excluídos não entram na ordem.
 */
async function reorder(
  supabase: Supabase,
  table: "professionals" | "services" | "subscription_plans",
  id: string,
  direction: -1 | 1,
  tag: string,
): Promise<SiteActionResult> {
  const { data: list, error } = await supabase
    .from(table)
    .select("id, name, sort_order")
    .is("deleted_at", null)
    .order("sort_order")
    .order("name");
  if (error) return failure("Não foi possível carregar a ordem. Tente novamente.");

  const index = list.findIndex((row) => row.id === id);
  const neighbor = list[index + direction];
  if (index === -1 || !neighbor) return { ok: true, message: "" };

  const reordered = [...list];
  [reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]];
  const changes = reordered
    .map((row, position) => ({ id: row.id, sort_order: position + 1, previous: row.sort_order }))
    .filter((row) => row.sort_order !== row.previous);

  for (const change of changes) {
    const { error: updateError } = await supabase.from(table).update({ sort_order: change.sort_order }).eq("id", change.id);
    if (updateError) {
      refreshSite(tag);
      return failure("A ordem foi salva só em parte. Confira a lista e tente de novo.");
    }
  }

  refreshSite(tag);
  return { ok: true, message: `${list[index].name} ${direction === -1 ? "subiu" : "desceu"} na ordem de exibição.` };
}

export async function moveProfessionalAction(id: string, direction: -1 | 1): Promise<SiteActionResult> {
  if (!isUuid(id) || (direction !== -1 && direction !== 1)) return failure("Profissional não encontrado.");
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  return reorder(auth.supabase, "professionals", id, direction, catalogTags.professionals);
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

// --- Edição do site > Serviços ---
//
// Preço e duração de cada atendimento são copiados na reserva (appointment_services e os
// totais em appointments): mudar o catálogo vale só para novos agendamentos. O repasse do
// plano (service_payouts) é gravado em cada serviço do atendimento ao concluir.
//
// Combos (service_components): um combo lista os serviços simples que já inclui. O
// agendamento não deixa escolher um combo junto com uma das partes (o banco confere de novo).

function refreshServices() {
  // Serviços aparecem na landing e no agendamento; a lista de quem atende cada um fica no
  // catálogo de profissionais.
  updateTag(catalogTags.services);
  updateTag(catalogTags.professionals);
}

export type SaveServiceInput = ServiceInput & {
  /** null = novo serviço. */
  id: string | null;
  /** Combo: ids dos serviços simples que ele inclui. Vazio = serviço simples. */
  components: string[];
};

/** Até quantos serviços um combo pode incluir (o agendamento aceita até 5 por horário). */
const maxComponents = 5;

/**
 * Confere as partes de um combo: serviços existentes, não excluídos e simples, e o próprio
 * serviço não pode ser parte de outro combo (sem aninhar). O gatilho do banco repete a regra.
 */
async function checkComponents(supabase: Supabase, serviceId: string | null, components: string[]) {
  if (!components.length) return null;
  const [parts, nested, usedIn] = await Promise.all([
    supabase.from("services").select("id").in("id", components).is("deleted_at", null),
    supabase.from("service_components").select("service_id").in("service_id", components).limit(1),
    serviceId
      ? supabase.from("service_components").select("service_id").eq("component_id", serviceId).limit(1)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (parts.error || nested.error || usedIn.error) return "Não foi possível conferir o combo. Tente novamente.";
  if (parts.data.length !== components.length) return "Um dos serviços do combo não existe mais. Recarregue a página.";
  if (nested.data.length) return "Um combo só pode incluir serviços simples (não outro combo).";
  if (usedIn.data?.length) return "Este serviço faz parte de um combo, então não pode ser um combo também.";
  return null;
}

/** Grava as partes do combo mexendo só no que mudou. */
async function saveComponents(supabase: Supabase, serviceId: string, components: string[]) {
  const { data: current, error } = await supabase
    .from("service_components")
    .select("component_id")
    .eq("service_id", serviceId);
  if (error) return false;
  const have = new Set(current.map((row) => row.component_id as string));
  const removed = [...have].filter((id) => !components.includes(id));
  const added = components.filter((id) => !have.has(id));
  if (removed.length) {
    const { error: deleteError } = await supabase
      .from("service_components")
      .delete()
      .eq("service_id", serviceId)
      .in("component_id", removed);
    if (deleteError) return false;
  }
  if (added.length) {
    const { error: insertError } = await supabase
      .from("service_components")
      .insert(added.map((componentId) => ({ service_id: serviceId, component_id: componentId })));
    if (insertError) return false;
  }
  return true;
}

export async function saveServiceAction(input: SaveServiceInput): Promise<SiteActionResult> {
  if (
    typeof input?.name !== "string" ||
    typeof input.description !== "string" ||
    typeof input.durationMinutes !== "number" ||
    typeof input.price !== "number" ||
    typeof input.planPayout !== "number" ||
    typeof input.icon !== "string" ||
    typeof input.isPopular !== "boolean" ||
    (input.id !== null && !isUuid(input.id)) ||
    !Array.isArray(input.components) ||
    input.components.length > maxComponents ||
    !input.components.every(isUuid) ||
    new Set(input.components).size !== input.components.length ||
    (input.id !== null && input.components.includes(input.id)) ||
    Object.keys(validateService(input, serviceIconKeys)).length
  ) {
    return failure("Revise os dados do serviço.");
  }

  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const comboProblem = await checkComponents(supabase, input.id, input.components);
  if (comboProblem) return failure(comboProblem);

  const name = input.name.trim();
  const fields = {
    name,
    description: input.description.trim() || null,
    duration_minutes: input.durationMinutes,
    price: input.price,
    icon: input.icon,
    is_popular: input.isPopular,
  };

  if (input.id === null) {
    const { data: existing, error: listError } = await supabase.from("services").select("slug, sort_order");
    if (listError) return failure("Não foi possível conferir os serviços. Tente novamente.");

    const { data: created, error } = await supabase
      .from("services")
      .insert({
        ...fields,
        slug: createServiceSlug(name, existing.map((row) => row.slug)),
        sort_order: Math.max(0, ...existing.map((row) => row.sort_order)) + 1,
      })
      .select("id")
      .single();
    if (error || !created) return failure("Não foi possível criar o serviço. Tente novamente.");

    // Repasse do plano e, como os atuais, atendido por todos os profissionais em uso.
    const { data: team, error: teamError } = await supabase
      .from("professionals")
      .select("id")
      .eq("is_active", true)
      .is("deleted_at", null);
    const payout = await supabase
      .from("service_payouts")
      .insert({ service_id: created.id, plan_payout_amount: input.planPayout });
    const links =
      teamError || !team.length
        ? { error: teamError }
        : await supabase
            .from("professional_services")
            .insert(team.map((professional) => ({ professional_id: professional.id, service_id: created.id })));
    const combo = await saveComponents(supabase, created.id, input.components);
    if (payout.error || links.error || !combo) {
      // Ainda sem histórico: desfaz o cadastro inteiro (repasse e vínculos caem em cascata).
      await supabase.from("services").delete().eq("id", created.id);
      return failure("Não foi possível concluir o cadastro do serviço. Nada foi salvo; tente novamente.");
    }

    refreshServices();
    return { ok: true, message: `${name} foi adicionado aos serviços.` };
  }

  const { data: updated, error } = await supabase
    .from("services")
    .update(fields)
    .eq("id", input.id)
    .is("deleted_at", null)
    .select("id");
  if (error || !updated?.length) return failure("Não foi possível salvar o serviço. Tente novamente.");

  const { error: payoutError } = await supabase
    .from("service_payouts")
    .upsert({ service_id: input.id, plan_payout_amount: input.planPayout }, { onConflict: "service_id" });
  const combo = await saveComponents(supabase, input.id, input.components);

  refreshServices();
  if (payoutError) return { ok: true, message: `${name} salvo, mas o repasse do plano não foi atualizado. Tente de novo.` };
  if (!combo) return { ok: true, message: `${name} salvo, mas os serviços do combo não foram atualizados. Tente de novo.` };
  return { ok: true, message: `${name} salvo. Os novos agendamentos já usam os dados atualizados.` };
}

export async function setServiceActiveAction(id: string, active: boolean): Promise<SiteActionResult> {
  if (!isUuid(id) || typeof active !== "boolean") return failure("Serviço não encontrado. Recarregue a página.");
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("services")
    .update({ is_active: active })
    .eq("id", id)
    .is("deleted_at", null)
    .select("name");
  if (error || !data?.length) return failure("Não foi possível mudar o status. Tente novamente.");

  refreshServices();
  return {
    ok: true,
    message: active
      ? `${data[0].name} voltou ao site e ao agendamento.`
      : `${data[0].name} saiu do site e do agendamento. O histórico continua no painel.`,
  };
}

export async function moveServiceAction(id: string, direction: -1 | 1): Promise<SiteActionResult> {
  if (!isUuid(id) || (direction !== -1 && direction !== 1)) return failure("Serviço não encontrado.");
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  return reorder(auth.supabase, "services", id, direction, catalogTags.services);
}

/**
 * Exclui um serviço. Enquanto fizer parte de algum plano, não pode ser excluído (tire do
 * plano antes). Sem atendimentos, a linha é apagada (repasse e vínculos em cascata). Com
 * histórico, a exclusão é lógica: deleted_at + inativo; atendimentos e fechamentos
 * continuam com ele. Horários futuros não são cancelados.
 */
export async function deleteServiceAction(id: string): Promise<SiteActionResult> {
  if (!isUuid(id)) return failure("Serviço não encontrado. Recarregue a página.");
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: service } = await supabase.from("services").select("name, deleted_at").eq("id", id).maybeSingle();
  if (!service || service.deleted_at) return failure("Serviço não encontrado. Recarregue a página.");

  const [appointments, plans] = await Promise.all([
    // Qualquer serviço do atendimento (não só o primeiro) conta como histórico.
    supabase.from("appointment_services").select("appointment_id", { count: "exact", head: true }).eq("service_id", id),
    supabase.from("plan_services").select("subscription_plans(name)").eq("service_id", id),
  ]);
  if (appointments.error || plans.error) return failure("Não foi possível conferir o uso do serviço. Nada foi excluído.");

  const planNames = (plans.data as unknown as { subscription_plans: { name: string } | null }[])
    .flatMap((row) => (row.subscription_plans ? [row.subscription_plans.name] : []));
  if (planNames.length) {
    return failure(
      `${service.name} faz parte de: ${planNames.join(", ")}. Tire o serviço desses planos antes de excluir (ou só inative).`,
    );
  }

  if (!appointments.count) {
    const { data: deleted, error } = await supabase.from("services").delete().eq("id", id).select("id");
    if (!error && deleted?.length) {
      refreshServices();
      return { ok: true, message: `${service.name} foi excluído.` };
    }
    // Atendimento criado entre a conferência e o delete (FK): cai na exclusão lógica.
    if (error?.code !== "23503") return failure("Não foi possível excluir. Tente novamente.");
  }

  const { data: archived, error } = await supabase
    .from("services")
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error || !archived?.length) return failure("Não foi possível excluir. Tente novamente.");

  refreshServices();
  return { ok: true, message: `${service.name} foi excluído. Os atendimentos e fechamentos com ele continuam no painel.` };
}

// --- Edição do site > Planos ---
//
// Cada mensalidade guarda o valor do ciclo em que foi gerada (subscription_payments.amount):
// mudar o preço vale para os próximos ciclos. Mudar os serviços incluídos vale na hora para
// quem assina; atendimentos concluídos guardam a cobertura gravada e não mudam.

export type SavePlanInput = PlanInput & { /** null = novo plano. */ id: string | null };

export async function savePlanAction(input: SavePlanInput): Promise<SiteActionResult> {
  if (
    typeof input?.name !== "string" ||
    typeof input.description !== "string" ||
    typeof input.monthlyPrice !== "number" ||
    !Array.isArray(input.benefits) ||
    input.benefits.some(
      (benefit) =>
        !isUuid(benefit?.serviceId) || typeof benefit.quantity !== "number" || typeof benefit.period !== "string",
    ) ||
    (input.id !== null && !isUuid(input.id)) ||
    Object.keys(validatePlan(input)).length
  ) {
    return failure("Revise os dados do plano.");
  }

  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  // Serviços do plano precisam existir e não ter sido excluídos.
  const serviceIds = input.benefits.map((benefit) => benefit.serviceId);
  const { data: found, error: servicesError } = await supabase
    .from("services")
    .select("id")
    .in("id", serviceIds)
    .is("deleted_at", null);
  if (servicesError || found.length !== serviceIds.length) {
    return failure("Algum serviço escolhido não está mais disponível. Recarregue a página.");
  }

  const name = input.name.trim();
  const fields = { name, description: input.description.trim() || null, monthly_price: input.monthlyPrice };
  const rows = (planId: string) =>
    input.benefits.map((benefit) => ({
      plan_id: planId,
      service_id: benefit.serviceId,
      weekly_limit: benefit.quantity,
      period: benefit.period,
    }));

  if (input.id === null) {
    const { data: existing, error: listError } = await supabase.from("subscription_plans").select("slug, sort_order");
    if (listError) return failure("Não foi possível conferir os planos. Tente novamente.");

    const { data: created, error } = await supabase
      .from("subscription_plans")
      .insert({
        ...fields,
        slug: createPlanSlug(name, existing.map((row) => row.slug)),
        sort_order: Math.max(0, ...existing.map((row) => row.sort_order)) + 1,
      })
      .select("id")
      .single();
    if (error || !created) return failure("Não foi possível criar o plano. Tente novamente.");

    const { error: benefitsError } = await supabase.from("plan_services").insert(rows(created.id));
    if (benefitsError) {
      // Ainda sem assinantes: desfaz o cadastro inteiro.
      await supabase.from("subscription_plans").delete().eq("id", created.id);
      return failure("Não foi possível salvar os serviços do plano. Nada foi salvo; tente novamente.");
    }

    updateTag(catalogTags.plans);
    return { ok: true, message: `${name} foi criado e já pode receber assinantes.` };
  }

  const { data: current, error: currentError } = await supabase
    .from("subscription_plans")
    .select("monthly_price")
    .eq("id", input.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (currentError || !current) return failure("Plano não encontrado. Recarregue a página.");

  const { error } = await supabase.from("subscription_plans").update(fields).eq("id", input.id);
  if (error) return failure("Não foi possível salvar o plano. Tente novamente.");

  // Benefícios: grava os da lista (novos ou alterados) e só então tira os que saíram.
  const { error: upsertError } = await supabase
    .from("plan_services")
    .upsert(rows(input.id), { onConflict: "plan_id,service_id" });
  const { error: removeError } = upsertError
    ? { error: upsertError }
    : await supabase
        .from("plan_services")
        .delete()
        .eq("plan_id", input.id)
        .not("service_id", "in", `(${serviceIds.join(",")})`);

  updateTag(catalogTags.plans);
  if (upsertError || removeError) {
    return failure("Os dados do plano foram salvos, mas os serviços incluídos não. Confira e tente de novo.");
  }
  const priceChanged = Number(current.monthly_price) !== input.monthlyPrice;
  return {
    ok: true,
    message: priceChanged
      ? `${name} salvo. A nova mensalidade vale a partir dos próximos ciclos; as já geradas mantêm o valor.`
      : `${name} salvo.`,
  };
}

export async function setPlanActiveAction(id: string, active: boolean): Promise<SiteActionResult> {
  if (!isUuid(id) || typeof active !== "boolean") return failure("Plano não encontrado. Recarregue a página.");
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("subscription_plans")
    .update({ is_active: active })
    .eq("id", id)
    .is("deleted_at", null)
    .select("name");
  if (error || !data?.length) return failure("Não foi possível mudar o status. Tente novamente.");

  updateTag(catalogTags.plans);
  return {
    ok: true,
    message: active
      ? `${data[0].name} voltou a aceitar novos assinantes.`
      : `${data[0].name} não aceita novos assinantes. Quem já assina continua com o plano.`,
  };
}

export async function movePlanAction(id: string, direction: -1 | 1): Promise<SiteActionResult> {
  if (!isUuid(id) || (direction !== -1 && direction !== 1)) return failure("Plano não encontrado.");
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  return reorder(auth.supabase, "subscription_plans", id, direction, catalogTags.plans);
}

/**
 * Exclui um plano. Bloqueado enquanto houver assinante com período em aberto (ativo ou
 * congelado): troque o plano deles antes. Sem nenhuma assinatura, a linha é apagada
 * (benefícios em cascata). Com histórico, a exclusão é lógica: assinaturas e mensalidades
 * antigas continuam apontando para ele.
 */
export async function deletePlanAction(id: string): Promise<SiteActionResult> {
  if (!isUuid(id)) return failure("Plano não encontrado. Recarregue a página.");
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: plan } = await supabase.from("subscription_plans").select("name, deleted_at").eq("id", id).maybeSingle();
  if (!plan || plan.deleted_at) return failure("Plano não encontrado. Recarregue a página.");

  const { data: subscriptions, error: usageError } = await supabase
    .from("customer_subscriptions")
    .select("status, ended_at")
    .eq("plan_id", id);
  if (usageError) return failure("Não foi possível conferir os assinantes. Nada foi excluído.");

  const current = subscriptions.filter((row) => row.ended_at === null && row.status !== "cancelada").length;
  if (current) {
    return failure(
      `${plan.name} tem ${current === 1 ? "1 assinante" : `${current} assinantes`} no momento. Troque o plano deles em Clientes > Assinantes antes de excluir (ou só inative).`,
    );
  }

  if (!subscriptions.length) {
    const { data: deleted, error } = await supabase.from("subscription_plans").delete().eq("id", id).select("id");
    if (!error && deleted?.length) {
      updateTag(catalogTags.plans);
      return { ok: true, message: `${plan.name} foi excluído.` };
    }
    // Assinatura criada entre a conferência e o delete (FK): cai na exclusão lógica.
    if (error?.code !== "23503") return failure("Não foi possível excluir. Tente novamente.");
  }

  const { data: archived, error } = await supabase
    .from("subscription_plans")
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error || !archived?.length) return failure("Não foi possível excluir. Tente novamente.");

  updateTag(catalogTags.plans);
  return { ok: true, message: `${plan.name} foi excluído. Assinaturas e mensalidades antigas continuam no painel.` };
}

// --- Edição do site > Horários ---
//
// Nada aqui cancela, remarca ou apaga agendamento. Antes de gravar um horário novo ou uma
// exceção, a ação lista os agendamentos futuros que ficariam fora do expediente (mesma regra
// de appointments_prepare) e só grava com a confirmação explícita do admin. Os agendamentos
// continuam marcados; a equipe decide o que fazer com cada um.

export type ScheduleConflict = {
  id: string;
  date: string;
  time: string;
  clientName: string;
  serviceName: string;
  professionalName: string;
};

export type ScheduleActionResult =
  | SiteActionResult
  | { ok: false; message: string; conflicts: ScheduleConflict[] };

type WeekPeriodInput = Pick<OpeningPeriod, "weekday" | "opensAt" | "closesAt">;

function shopToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/** Agendamentos ainda por acontecer que não caberiam no expediente proposto. */
async function findConflicts(
  supabase: Supabase,
  periods: readonly WeekPeriodInput[],
  exceptions: readonly ScheduleException[],
  range?: { start: string; end: string },
): Promise<ScheduleConflict[] | null> {
  let query = supabase
    .from("appointment_details")
    .select("id, local_date, local_time, starts_at, ends_at, customer_name, service_name, performed_by_name")
    .eq("status", "agendado")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at");
  if (range) query = query.gte("local_date", range.start).lte("local_date", range.end);
  const { data, error } = await query;
  if (error) return null;

  return data
    .filter(
      (row) =>
        !fitsSchedule(
          {
            id: row.id,
            date: row.local_date,
            time: row.local_time,
            durationMinutes: Math.round((Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60000),
          },
          periods,
          exceptions,
        ),
    )
    .map((row) => ({
      id: row.id,
      date: row.local_date,
      time: row.local_time,
      clientName: row.customer_name,
      serviceName: row.service_name,
      professionalName: row.performed_by_name,
    }));
}

async function loadSchedule(supabase: Supabase) {
  const [periods, exceptions] = await Promise.all([
    supabase.from("opening_periods").select(openingPeriodColumns),
    supabase.from("schedule_exceptions").select(scheduleExceptionColumns).gte("ends_on", shopToday()),
  ]);
  if (periods.error || exceptions.error) return null;
  return {
    periods: (periods.data as OpeningPeriodRow[]).map(toOpeningPeriod),
    exceptions: (exceptions.data as ScheduleExceptionRow[]).map(toScheduleException),
  };
}

function conflictMessage(count: number) {
  return count === 1
    ? "1 agendamento ficaria fora do novo horário. Ele não será cancelado nem remarcado."
    : `${count} agendamentos ficariam fora do novo horário. Eles não serão cancelados nem remarcados.`;
}

/**
 * Salva o horário semanal mexendo só no que mudou: remove os períodos retirados e depois
 * insere os novos (a validação acontece antes, então o banco não deve recusar a inserção).
 */
export async function saveWeekAction(
  periods: WeekPeriodInput[],
  confirmConflicts: boolean,
): Promise<ScheduleActionResult> {
  if (
    !Array.isArray(periods) ||
    periods.some(
      (period) =>
        typeof period?.weekday !== "number" || typeof period.opensAt !== "string" || typeof period.closesAt !== "string",
    ) ||
    validateWeek(periods)
  ) {
    return failure(validateWeek(Array.isArray(periods) ? periods : []) ?? "Revise o horário semanal.");
  }

  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const current = await loadSchedule(supabase);
  if (!current) return failure("Não foi possível carregar o horário atual. Nada foi alterado.");

  const conflicts = await findConflicts(supabase, periods, current.exceptions);
  if (!conflicts) return failure("Não foi possível conferir os agendamentos. Nada foi alterado.");
  if (conflicts.length && confirmConflicts !== true) {
    return { ok: false, message: conflictMessage(conflicts.length), conflicts };
  }

  const key = (period: WeekPeriodInput) => `${period.weekday}|${period.opensAt}|${period.closesAt}`;
  const wanted = new Set(periods.map(key));
  const existing = new Set(current.periods.map(key));
  const toRemove = current.periods.filter((period) => !wanted.has(key(period)));
  const toAdd = periods.filter((period, index) => !existing.has(key(period)) && periods.findIndex((item) => key(item) === key(period)) === index);

  if (!toRemove.length && !toAdd.length) return { ok: true, message: "O horário semanal já estava assim." };

  if (toRemove.length) {
    const { error } = await supabase.from("opening_periods").delete().in("id", toRemove.map((period) => period.id));
    if (error) return failure("Não foi possível salvar o horário. Nada foi alterado.");
  }
  if (toAdd.length) {
    const { error } = await supabase.from("opening_periods").insert(
      toAdd.map((period) => ({ weekday: period.weekday, opens_at: period.opensAt, closes_at: period.closesAt })),
    );
    if (error) {
      updateTag(catalogTags.hours);
      return failure(
        "Os períodos retirados foram removidos, mas os novos não foram gravados. Confira o horário semanal e salve de novo.",
      );
    }
  }

  updateTag(catalogTags.hours);
  return {
    ok: true,
    message: conflicts.length
      ? `Horário salvo. ${conflicts.length === 1 ? "O agendamento fora do horário continua" : `Os ${conflicts.length} agendamentos fora do horário continuam`} na agenda para você decidir o que fazer.`
      : "Horário semanal salvo. O site e o agendamento já usam o novo horário.",
  };
}

export async function saveExceptionAction(input: ExceptionInput, confirmConflicts: boolean): Promise<ScheduleActionResult> {
  const today = shopToday();
  if (
    typeof input?.startsOn !== "string" ||
    typeof input.endsOn !== "string" ||
    !["fechado", "horario_especial", "bloqueio"].includes(input.kind) ||
    typeof input.opensAt !== "string" ||
    typeof input.closesAt !== "string" ||
    typeof input.reason !== "string" ||
    Object.keys(validateException(input, today)).length
  ) {
    return failure("Revise as datas e os horários da exceção.");
  }

  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const current = await loadSchedule(supabase);
  if (!current) return failure("Não foi possível carregar o horário atual. Nada foi alterado.");

  const isClosed = input.kind === "fechado";
  const proposed: ScheduleException = {
    id: "nova",
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    kind: input.kind,
    opensAt: isClosed ? null : input.opensAt,
    closesAt: isClosed ? null : input.closesAt,
    reason: input.reason.trim(),
  };
  const conflicts = await findConflicts(supabase, current.periods, [...current.exceptions, proposed], {
    start: input.startsOn,
    end: input.endsOn,
  });
  if (!conflicts) return failure("Não foi possível conferir os agendamentos. Nada foi alterado.");
  if (conflicts.length && confirmConflicts !== true) {
    return { ok: false, message: conflictMessage(conflicts.length), conflicts };
  }

  const { error } = await supabase.from("schedule_exceptions").insert({
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    kind: input.kind,
    opens_at: proposed.opensAt,
    closes_at: proposed.closesAt,
    reason: proposed.reason || null,
  });
  if (error) return failure("Não foi possível salvar a exceção. Tente novamente.");

  return {
    ok: true,
    message: conflicts.length
      ? `Exceção salva. ${conflicts.length === 1 ? "O agendamento afetado continua" : `Os ${conflicts.length} agendamentos afetados continuam`} na agenda para você decidir o que fazer.`
      : "Exceção salva. O agendamento online já considera a mudança.",
  };
}

/** Remove uma exceção (o dia volta ao horário semanal). Não afeta nenhum agendamento. */
export async function deleteExceptionAction(id: string): Promise<SiteActionResult> {
  if (!isUuid(id)) return failure("Exceção não encontrada. Recarregue a página.");
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase.from("schedule_exceptions").delete().eq("id", id).select("id");
  if (error || !data?.length) return failure("Não foi possível remover a exceção. Tente novamente.");
  return { ok: true, message: "Exceção removida. Esses dias voltam ao horário semanal." };
}
