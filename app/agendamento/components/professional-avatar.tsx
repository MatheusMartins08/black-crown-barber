import Image from "next/image";
import { Crown } from "lucide-react";
import { getProfessional } from "../../data/booking";

/** Foto pequena do profissional; sem id, mostra a marca da casa ("qualquer profissional"). */
export default function ProfessionalAvatar({ professionalId, size = 28 }: { professionalId: string | null; size?: number }) {
  const professional = getProfessional(professionalId);

  return (
    <span aria-hidden="true" className="booking-avatar" style={{ width: size, height: size }}>
      {professional ? (
        <Image
          alt=""
          className="booking-avatar__image"
          fill
          sizes={`${size * 2}px`}
          src={professional.image}
          style={{ objectPosition: professional.imagePosition }}
        />
      ) : (
        <Crown size={Math.round(size * 0.5)} strokeWidth={1.6} />
      )}
    </span>
  );
}
