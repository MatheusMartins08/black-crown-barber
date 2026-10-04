import { ArrowRight, LoaderCircle } from "lucide-react";

export type PrimaryAction = {
  label: string;
  /** Rótulo curto para a barra inferior do mobile. */
  shortLabel?: string;
  onClick: () => void;
  disabled: boolean;
  loading?: boolean;
  loadingLabel?: string;
};

export default function PrimaryActionButton({
  action,
  className = "",
  compact = false,
}: {
  action: PrimaryAction;
  className?: string;
  compact?: boolean;
}) {
  const label = compact && action.shortLabel ? action.shortLabel : action.label;

  return (
    <button
      aria-busy={action.loading || undefined}
      className={`button booking-primary ${className}`.trim()}
      disabled={action.disabled || action.loading}
      onClick={action.onClick}
      type="button"
    >
      {action.loading ? (
        <>
          <LoaderCircle aria-hidden="true" className="booking-spinner" size={17} />
          {action.loadingLabel ?? label}
        </>
      ) : (
        <>
          {label}
          <ArrowRight aria-hidden="true" size={17} strokeWidth={1.8} />
        </>
      )}
    </button>
  );
}
