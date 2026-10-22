import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ShopScope from "./components/shop-scope";
import ShopUnavailable, { unknownShopText } from "./components/shop-unavailable";
import { getCurrentShop } from "./lib/shop";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const shop = await getCurrentShop();
  const name = shop?.name ?? "Barbearia";
  const title = shop?.city ? `${name} | Barbearia em ${shop.city}` : `${name} | Barbearia`;
  const description =
    shop?.description ?? "Cortes masculinos, barba e cuidado em uma barbearia de estilo clássico e contemporâneo.";

  return {
    // Páginas internas: "Clientes | Painel | <loja>".
    title: { default: title, template: `%s | ${name}` },
    description: `${description} Agende seu horário online.`,
    openGraph: {
      title,
      description: `Conheça os serviços, a equipe e o espaço da ${name}.`,
      locale: "pt_BR",
      siteName: name,
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    // Só a landing de uma loja ativa pode ser indexada. Agendamento e painel declaram noindex
    // nos próprios metadados; domínio desconhecido e loja suspensa também ficam de fora.
    robots: shop?.status === "ativa" ? { index: true, follow: false } : { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const shop = await getCurrentShop();

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {shop ? (
          <>
            <ShopScope shopId={shop.id} />
            {children}
          </>
        ) : (
          <ShopUnavailable {...unknownShopText} />
        )}
      </body>
    </html>
  );
}
