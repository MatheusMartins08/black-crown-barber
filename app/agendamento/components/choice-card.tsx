import type { CSSProperties, ReactNode } from "react";
import { Check } from "lucide-react";

type ChoiceCardProps = {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
  className?: string;
  /** Posição na lista, usada para escalonar a entrada dos cards. */
  index?: number;
};

export default function ChoiceCard({ selected, onSelect, children, className = "", index = 0 }: ChoiceCardProps) {
  return (
    <button
      aria-pressed={selected}
      className={["choice-card", className, selected ? "is-selected" : ""].filter(Boolean).join(" ")}
      onClick={onSelect}
      style={{ "--stagger": index } as CSSProperties}
      type="button"
    >
      <span aria-hidden="true" className="choice-card__check">
        <Check size={14} strokeWidth={2.4} />
      </span>
      {children}
    </button>
  );
}
