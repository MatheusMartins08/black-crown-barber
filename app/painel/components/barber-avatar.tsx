import Image from "next/image";
import { barbers } from "../../data/site";

export default function BarberAvatar({ name, size = 28 }: { name: string; size?: number }) {
  const barber = barbers.find((item) => item.name === name);
  if (!barber) return null;

  return (
    <span className="admin-avatar" style={{ width: size, height: size }}>
      <Image
        alt=""
        className="admin-avatar__image"
        fill
        sizes={`${size * 2}px`}
        src={barber.image}
        style={{ objectPosition: barber.imagePosition }}
      />
    </span>
  );
}
