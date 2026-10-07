"use client";

import Image from "next/image";
import { findProfessional, usePainelProfessionals } from "./painel-catalog";

export default function BarberAvatar({ professionalId, size = 28 }: { professionalId: string; size?: number }) {
  const barber = findProfessional(usePainelProfessionals(), professionalId);
  if (!barber?.imageUrl) return null;

  return (
    <span className="admin-avatar" style={{ width: size, height: size }}>
      <Image
        alt=""
        className="admin-avatar__image"
        fill
        sizes={`${size * 2}px`}
        src={barber.imageUrl}
        style={{ objectPosition: barber.imagePosition }}
      />
    </span>
  );
}
