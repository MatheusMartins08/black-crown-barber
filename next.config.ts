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
};

export default nextConfig;
