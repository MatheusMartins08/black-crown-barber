import { SlidersHorizontal } from "lucide-react";

/**
 * Botão "Filtros" que só aparece no celular: abre o grupo `.admin-filters--collapsible`
 * indicado em `controls`. No desktop os filtros ficam sempre visíveis.
 */
export default function FilterToggle({
  activeCount,
  controls,
  open,
  onToggle,
}: {
  activeCount: number;
  controls: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      aria-controls={controls}
      aria-expanded={open}
      className="admin-toggle-button admin-filter-toggle"
      onClick={onToggle}
      type="button"
    >
      <SlidersHorizontal aria-hidden="true" size={15} />
      Filtros
      {activeCount ? (
        <span className="admin-toggle-button__badge">
          {activeCount}
          <span className="sr-only"> {activeCount === 1 ? "ativo" : "ativos"}</span>
        </span>
      ) : null}
    </button>
  );
}
