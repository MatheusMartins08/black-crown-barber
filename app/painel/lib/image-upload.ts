import { getSiteMediaPublicPrefix, imageRules, siteMediaBucket, type SiteMediaFolder } from "../../data/site-media";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { supabaseUrl } from "../../lib/supabase/env";

// Envio de imagens do painel para o bucket site-media, com a sessão do admin (as
// políticas do bucket recusam qualquer outro usuário). Antes de enviar, a foto é reduzida
// no navegador: fotos de celular chegam a 4000 px, e o site nunca mostra mais que ~1600.

type PreparedImage = { blob: Blob; extension: "webp" | "jpg" | "png" | "avif"; type: string };

const extensionByType: Record<string, PreparedImage["extension"]> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/avif": "avif",
};

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Reduz para no máximo imageRules.maxDimension e converte para WebP (ou JPEG se o navegador não gerar WebP). */
async function prepareImage(file: File): Promise<PreparedImage> {
  const original: PreparedImage = { blob: file, extension: extensionByType[file.type], type: file.type };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Formato que o navegador não decodifica (ex.: AVIF em navegador antigo): envia como veio.
    return original;
  }

  const scale = Math.min(1, imageRules.maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const webp = await canvasToBlob(canvas, "image/webp", 0.85);
  const converted =
    webp?.type === "image/webp"
      ? { blob: webp, extension: "webp" as const, type: "image/webp" }
      : await canvasToBlob(canvas, "image/jpeg", 0.88).then((jpeg) =>
          jpeg ? { blob: jpeg, extension: "jpg" as const, type: "image/jpeg" } : null,
        );

  // Sem redução e sem ganho de tamanho: fica o arquivo original.
  if (!converted || (scale === 1 && converted.blob.size >= file.size)) return original;
  return converted;
}

/** Envia a imagem com nome único (uuid) e devolve a URL pública e o caminho no bucket. */
export async function uploadSiteImage(folder: SiteMediaFolder, file: File) {
  const prepared = await prepareImage(file);
  const path = `${folder}/${crypto.randomUUID()}.${prepared.extension}`;
  const { error } = await getSupabaseBrowserClient()
    .storage.from(siteMediaBucket)
    .upload(path, prepared.blob, { contentType: prepared.type, cacheControl: "31536000", upsert: false });
  if (error) {
    throw new Error(
      error.message.toLowerCase().includes("size")
        ? "A imagem ficou maior que o limite do armazenamento. Escolha outra."
        : "Não foi possível enviar a foto. Verifique a conexão e tente de novo.",
    );
  }
  return { path, url: `${getSiteMediaPublicPrefix(supabaseUrl)}${path}` };
}
