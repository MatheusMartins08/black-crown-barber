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
  title: "Black Crown Barber | Barbearia em Belo Horizonte",
  description:
    "Cortes masculinos, barba e cuidado em uma barbearia de estilo clássico e contemporâneo em Belo Horizonte. Agende seu horário online.",
  openGraph: {
    title: "Black Crown Barber | Barbearia em Belo Horizonte",
    description:
      "Conheça os serviços, a equipe e o espaço da Black Crown Barber.",
    locale: "pt_BR",
    siteName: "Black Crown Barber",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Black Crown Barber | Barbearia em Belo Horizonte",
    description:
      "Cortes masculinos e barba em uma barbearia de estilo clássico e contemporâneo.",
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
