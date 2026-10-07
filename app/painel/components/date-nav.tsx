import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, clampDate } from "../../data/painel";

type DateNavProps = {
  value: string;
  today: string;
  /** Limites consultáveis (inclusive). */
  min: string;
  max: string;
  onChange: (date: string) => void;
  /** Data das setas. Padrão: um dia antes ou depois. */
  step?: (date: string, direction: -1 | 1) => string;
  previousLabel?: string;
  nextLabel?: string;
};

const stepByDay = (date: string, direction: -1 | 1) => addDays(date, direction);

/** Setas, campo de data e "Hoje", sempre dentro de [min, max]. */
export default function DateNav({
  value,
  today,
  min,
  max,
  onChange,
  step = stepByDay,
  previousLabel = "Dia anterior",
  nextLabel = "Próximo dia",
}: DateNavProps) {
  function go(date: string) {
    // O campo nativo aceita datas digitadas fora do intervalo: essas são ignoradas.
    if (date && date >= min && date <= max) onChange(date);
  }

  return (
    <div className="admin-date-nav">
      <button
        aria-label={previousLabel}
        className="admin-icon-button"
        disabled={value <= min}
        onClick={() => go(clampDate(step(value, -1), min, max))}
        type="button"
      >
        <ChevronLeft aria-hidden="true" size={18} />
      </button>
      <label className="admin-date-input">
        <span className="sr-only">Escolher data</span>
        <input max={max} min={min} onChange={(event) => go(event.target.value)} type="date" value={value} />
      </label>
      <button
        aria-label={nextLabel}
        className="admin-icon-button"
        disabled={value >= max}
        onClick={() => go(clampDate(step(value, 1), min, max))}
        type="button"
      >
        <ChevronRight aria-hidden="true" size={18} />
      </button>
      <button
        className="admin-text-button"
        disabled={value === today}
        onClick={() => go(clampDate(today, min, max))}
        type="button"
      >
        Hoje
      </button>
    </div>
  );
}
