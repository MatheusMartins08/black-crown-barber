import type { SiteMediaFolder } from "./site-media";

// Imagens da landing editáveis pelo painel (tabela site_images): as 8 posições da galeria
// e a foto da seção "A barbearia". O conteúdo (foto, legenda, texto alternativo,
// enquadramento) vem do Supabase; o formato de cada posição no layout fica aqui, porque
// é desenho da página. Fundos e o comparador Antes/Depois não são editáveis.

export type SiteImageSlot =
  | "about"
  | "gallery-1"
  | "gallery-2"
  | "gallery-3"
  | "gallery-4"
  | "gallery-5"
  | "gallery-6"
  | "gallery-7"
  | "gallery-8";

export type SiteImage = {
  slot: SiteImageSlot;
  /** Legenda da galeria (o "about" não mostra legenda no site). */
  label: string;
  alt: string;
  /** Caminho local (/gallery-corte-01.jpg) ou URL pública do bucket site-media. */
  imageUrl: string;
  imagePosition: string;
  sortOrder: number;
};

export type SiteImageRow = {
  slot: SiteImageSlot;
  label: string;
  alt: string;
  image_url: string;
  image_position: string;
  sort_order: number;
};

export const siteImageColumns = "slot, label, alt, image_url, image_position, sort_order";

export function toSiteImage(row: SiteImageRow): SiteImage {
  return {
    slot: row.slot,
    label: row.label,
    alt: row.alt,
    imageUrl: row.image_url,
    imagePosition: row.image_position,
    sortOrder: row.sort_order,
  };
}

/** Formato de cada posição da galeria no grid (classes de app/globals.css). */
export const galleryLayouts: Record<string, string> = {
  "gallery-1": "gallery-item--large",
  "gallery-2": "gallery-item--portrait",
  "gallery-4": "gallery-item--wide",
  "gallery-7": "gallery-item--portrait",
};

const formatLabels: Record<string, string> = {
  "gallery-item--large": "Destaque grande",
  "gallery-item--portrait": "Vertical",
  "gallery-item--wide": "Horizontal larga",
};

/** Como a posição aparece no site, para orientar a escolha da foto no painel. */
export function describeSlotFormat(slot: SiteImageSlot) {
  if (slot === "about") return "Seção “A barbearia”";
  return formatLabels[galleryLayouts[slot]] ?? "Quadrada";
}

export function isGallerySlot(slot: string) {
  return /^gallery-[1-8]$/.test(slot);
}

export function isSiteImageSlot(value: unknown): value is SiteImageSlot {
  return typeof value === "string" && (value === "about" || isGallerySlot(value));
}

/** Pasta do bucket de cada posição. */
export function getSlotFolder(slot: SiteImageSlot): SiteMediaFolder {
  return slot === "about" ? "barbershop" : "gallery";
}

export const siteImageLimits = { label: 40, alt: 200 };

export type SiteImageInput = { label: string; alt: string };
export type SiteImageErrors = Partial<Record<"label" | "alt", string>>;

export function validateSiteImage(input: SiteImageInput): SiteImageErrors {
  const errors: SiteImageErrors = {};
  const label = input.label.trim();
  const alt = input.alt.trim();
  if (!label) errors.label = "Informe a legenda.";
  else if (label.length > siteImageLimits.label) errors.label = `Use até ${siteImageLimits.label} caracteres.`;
  if (!alt) errors.alt = "Descreva a imagem para quem usa leitor de tela.";
  else if (alt.length > siteImageLimits.alt) errors.alt = `Use até ${siteImageLimits.alt} caracteres.`;
  return errors;
}
