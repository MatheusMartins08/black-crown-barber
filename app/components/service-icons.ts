import {
  Baby,
  Brush,
  createLucideIcon,
  Crown,
  Droplets,
  HandHeart,
  Palette,
  Scissors,
  Sparkles,
  SprayCan,
  Wind,
  type LucideIcon,
} from "lucide-react";

// Ícones extras no mesmo padrão do Lucide (grade 24×24, traço arredondado), registrados
// com `createLucideIcon` para aceitar `size` e `strokeWidth` como os demais.
// O bigode é um desenho próprio. Fontes dos demais (via Iconify): navalha
// `icon-park-outline:straight-razor` e sobrancelha `icon-park-outline:eyebrow`
// (Apache-2.0, convertidos de 48 para 24).

const Mustache = createLucideIcon("mustache", [
  [
    "path",
    {
      d: "M12 9.8C11.4 8.4 10 7.4 8.4 7.5 6.6 7.6 5.4 9.8 3.4 10.6 2.6 10.9 1.8 11 1.1 11 .9 11.7.9 12.5 1.2 13.2 2.8 15.4 4.6 16.6 6.6 16.6 9 16.6 10.6 12.8 12 12.8 13.4 12.8 15 16.6 17.4 16.6 19.4 16.6 21.2 15.4 22.8 13.2 23.1 12.5 23.1 11.7 22.9 11 22.2 11 21.4 10.9 20.6 10.6 18.6 9.8 17.4 7.6 15.6 7.5 14 7.4 12.6 8.4 12 9.8Z",
      key: "mustache",
    },
  ],
]);

const StraightRazor = createLucideIcon("straight-razor", [
  ["rect", { width: "19", height: "3", x: "1.805", y: "18.267", rx: "1", transform: "rotate(-10 1.805 18.267)", key: "razor-handle" }],
  ["path", { d: "m22 20-2-2", key: "razor-tail" }],
  [
    "path",
    {
      d: "M4 2l9.192 9.192-2.121 2.121L4.707 6.95c-1.414-1.415-1.414-2.122-1.414-2.829C3.293 3.414 4 2 4 2m0 0 9 9 4.5 4.5",
      key: "razor-blade",
    },
  ],
]);

const Eyebrow = createLucideIcon("eyebrow", [
  ["path", { d: "M12 20c4.97 0 9-5 9-5s-4.03-5-9-5-9 5-9 5 4.03 5 9 5Z", key: "eye" }],
  ["circle", { cx: "12", cy: "15", r: "2", key: "iris" }],
  ["path", { d: "M14 3c-3.5 0-9 1.75-10.5 3S3 9.5 4 9s7.6-2.9 10-3.5 5.83.42 7 1c-1.17-1-3.5-3.5-7-3.5Z", key: "brow" }],
]);

/**
 * Coleção fechada de ícones dos serviços (escolhidos no painel, nunca enviados como
 * arquivo). A chave é o que fica em services.icon; os 4 primeiros são os originais.
 */
export const serviceIconOptions: readonly { key: string; label: string; Icon: LucideIcon }[] = [
  { key: "scissors", label: "Tesoura", Icon: Scissors },
  { key: "mustache", label: "Bigode", Icon: Mustache },
  { key: "razor", label: "Navalha", Icon: StraightRazor },
  { key: "eyebrow", label: "Sobrancelha", Icon: Eyebrow },
  { key: "brush", label: "Pincel", Icon: Brush },
  { key: "wind", label: "Secador", Icon: Wind },
  { key: "spray-can", label: "Finalizador", Icon: SprayCan },
  { key: "droplets", label: "Hidratação", Icon: Droplets },
  { key: "sparkles", label: "Tratamento", Icon: Sparkles },
  { key: "palette", label: "Coloração", Icon: Palette },
  { key: "baby", label: "Infantil", Icon: Baby },
  { key: "hand-heart", label: "Massagem", Icon: HandHeart },
  { key: "crown", label: "Especial", Icon: Crown },
];

export const serviceIconKeys = serviceIconOptions.map((option) => option.key);

/** Ícone por chave. Use `serviceIcons[key] ?? DefaultServiceIcon` (chave desconhecida = tesoura). */
export const serviceIcons: Readonly<Record<string, LucideIcon>> = Object.fromEntries(
  serviceIconOptions.map((option) => [option.key, option.Icon]),
);

export const DefaultServiceIcon = Scissors;
