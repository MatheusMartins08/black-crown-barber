import type { MetadataRoute } from "next";

// Robôs de busca só leem a landing de cada barbearia. Painel (CRM), agendamento e qualquer
// outra rota ficam de fora; /_next/static e /_next/image são liberados só para a landing
// aparecer completa (estilos e fotos). Igual para todas as lojas: o arquivo não depende do
// domínio. Vale para robôs educados; o painel continua protegido por login e RLS, e as
// respostas do painel e do agendamento também levam X-Robots-Tag (proxy.ts).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/$", "/_next/static/", "/_next/image", "/icon.svg"],
      disallow: "/",
    },
  };
}
