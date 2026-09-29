import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Black Crown Barber | Template demonstrativo",
  description:
    "Cortes masculinos, barba e cuidado em um template demonstrativo de barbearia. Substitua informações e contatos antes de publicar.",
  openGraph: {
    title: "Black Crown Barber | Template demonstrativo",
    description:
      "Conheça os serviços, a equipe e o espaço da Black Crown Barber. Conteúdo demonstrativo.",
    locale: "pt_BR",
    siteName: "Black Crown Barber",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Black Crown Barber | Template demonstrativo",
    description:
      "Cortes masculinos e barba em um template demonstrativo de barbearia.",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
