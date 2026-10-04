"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatLongDate, getDateParts, type DaySummary } from "../../../data/booking";

type DateStripProps = {
  days: DaySummary[] | null;
  selectedDate: string | null;
  onSelect: (date: string) => void;
};

function describeStatus(day: DaySummary) {
  if (day.status === "closed") return "Fechado";
  if (day.status === "full") return "Lotado";
  return `${day.availableCount} ${day.availableCount === 1 ? "horário" : "horários"}`;
}

export default function DateStrip({ days, selectedDate, onSelect }: DateStripProps) {
  const listRef = useRef<HTMLUListElement>(null);

  // Mantém o dia escolhido visível (ex.: ao pular para o próximo horário livre).
  useEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector<HTMLElement>("[aria-pressed='true']");
    if (!list || !selected) return;

    // A lista é `position: relative`, então offsetLeft já é relativo a ela.
    const start = selected.offsetLeft;
    const end = start + selected.offsetWidth;
    if (start >= list.scrollLeft && end <= list.scrollLeft + list.clientWidth) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({ left: Math.max(0, start - 12), behavior: reducedMotion ? "auto" : "smooth" });
  }, [selectedDate, days]);

  function scrollByPage(direction: 1 | -1) {
    const list = listRef.current;
    if (!list) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollBy({ left: direction * list.clientWidth * 0.8, behavior: reducedMotion ? "auto" : "smooth" });
  }

  return (
    <div className="date-strip">
      <div className="date-strip__header">
        <p className="booking-label" id="date-strip-label">Escolha o dia</p>
        <div className="date-strip__arrows">
          <button aria-label="Dias anteriores" className="date-strip__arrow" onClick={() => scrollByPage(-1)} type="button">
            <ChevronLeft aria-hidden="true" size={18} />
          </button>
          <button aria-label="Próximos dias" className="date-strip__arrow" onClick={() => scrollByPage(1)} type="button">
            <ChevronRight aria-hidden="true" size={18} />
          </button>
        </div>
      </div>

      <ul aria-busy={!days} aria-labelledby="date-strip-label" className="date-strip__list" ref={listRef}>
        {days
          ? days.map((day) => {
              const parts = getDateParts(day.date);
              const status = describeStatus(day);
              const isSelected = day.date === selectedDate;

              return (
                <li key={day.date}>
                  <button
                    aria-label={`${formatLongDate(day.date)}, ${status.toLowerCase()}`}
                    aria-pressed={isSelected}
                    className={`date-chip date-chip--${day.status}${isSelected ? " is-selected" : ""}`}
                    onClick={() => onSelect(day.date)}
                    type="button"
                  >
                    <span className="date-chip__weekday">{parts.weekday}</span>
                    <span className="date-chip__day">{parts.day}</span>
                    <span className="date-chip__month">{parts.month}</span>
                    <span className="date-chip__status">{status}</span>
                  </button>
                </li>
              );
            })
          : Array.from({ length: 8 }, (_, index) => (
              <li aria-hidden="true" key={index}>
                <span className="date-chip date-chip--skeleton booking-skeleton" />
              </li>
            ))}
      </ul>
    </div>
  );
}
