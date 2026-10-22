import type { NextConfig } from "next";

// Fotos enviadas pelo painel ficam no bucket público "site-media" do Supabase Storage.
// Só esse caminho do projeto é liberado para o otimizador de imagens.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const siteMediaPattern = supabaseUrl
  ? [new URL("/storage/v1/object/public/site-media/**", supabaseUrl)]
  : [];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: siteMediaPattern,
  },
  // O dev server registra os argumentos de cada Server Action; o login e as actions de
  // assinante e equipe recebem senhas. Nada de senha no terminal.
  logging: {
    serverFunctions: false,
  },
};

export default nextConfig;
