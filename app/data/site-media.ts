// Imagens editáveis pelo painel: bucket público "site-media" no Supabase Storage
// (supabase/migrations/…20261007120000_site_media_storage.sql). Puro: usado no navegador
// (validação e prévia) e no servidor (Server Actions conferem a URL antes de gravar).

export const siteMediaBucket = "site-media";

/** Pastas liberadas pelas políticas do bucket. */
export type SiteMediaFolder = "barbers";

/** Mesmos tipos e limite do bucket; o Storage também recusa o que passar daqui. */
export const imageRules = {
  mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"] as readonly string[],
  extensions: ["jpg", "jpeg", "png", "webp", "avif"] as readonly string[],
  maxBytes: 5 * 1024 * 1024,
  /** Maior lado depois da redução feita no navegador antes do envio. */
  maxDimension: 1600,
  accept: "image/jpeg,image/png,image/webp,image/avif",
};

export function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

/** Confere tipo, extensão e tamanho do arquivo escolhido. Devolve a mensagem de erro ou null. */
export function validateImageFile(file: { name: string; type: string; size: number }) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!imageRules.mimeTypes.includes(file.type) || !imageRules.extensions.includes(extension)) {
    return "Formato não aceito. Use JPEG, PNG, WebP ou AVIF.";
  }
  if (file.size > imageRules.maxBytes) {
    return `Arquivo grande demais (${formatBytes(file.size)}). O limite é ${formatBytes(imageRules.maxBytes)}.`;
  }
  if (file.size === 0) return "O arquivo está vazio.";
  return null;
}

/** Prefixo das URLs públicas do bucket, ex.: https://xyz.supabase.co/storage/v1/object/public/site-media/ */
export function getSiteMediaPublicPrefix(supabaseUrl: string) {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${siteMediaBucket}/`;
}

const objectNamePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$/;

/**
 * Caminho do objeto no bucket ("barbers/<uuid>.webp") se a URL for uma imagem nossa
 * nessa pasta; senão null. Evita gravar URLs arbitrárias e apagar o que não é nosso.
 */
export function getSiteMediaPath(url: string | null, supabaseUrl: string, folder: SiteMediaFolder) {
  if (!url) return null;
  const prefix = getSiteMediaPublicPrefix(supabaseUrl);
  if (!url.startsWith(prefix)) return null;
  const path = url.slice(prefix.length);
  const [first, name, ...rest] = path.split("/");
  return first === folder && name && rest.length === 0 && objectNamePattern.test(name) ? path : null;
}
