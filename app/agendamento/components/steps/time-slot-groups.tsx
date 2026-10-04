import { Moon, Sun, Sunrise } from "lucide-react";
import { dayPeriods, getDayPeriod, type TimeSlot } from "../../../data/booking";

const periodIcons = { manha: Sunrise, tarde: Sun, noite: Moon };

type TimeSlotGroupsProps = {
  slots: TimeSlot[];
  selectedTime: string | null;
  onSelect: (slot: TimeSlot) => void;
};

export default function TimeSlotGroups({ slots, selectedTime, onSelect }: TimeSlotGroupsProps) {
  const groups = dayPeriods
    .map((period) => ({ period, slots: slots.filter((slot) => getDayPeriod(slot.time).id === period.id) }))
    .filter((group) => group.slots.length > 0);

  return (
    <div className="slot-groups">
      {groups.map(({ period, slots: periodSlots }) => {
        const Icon = periodIcons[period.id];
        const labelId = `slot-group-${period.id}`;

        return (
          <div className="slot-group" key={period.id}>
            <p className="slot-group__label" id={labelId}>
              <Icon aria-hidden="true" size={15} strokeWidth={1.7} />
              {period.label}
              <span>
                {periodSlots.length} {periodSlots.length === 1 ? "horário" : "horários"}
              </span>
            </p>
            <ul aria-labelledby={labelId} className="slot-grid">
              {periodSlots.map((slot) => (
                <li key={slot.time}>
                  <button
                    aria-pressed={slot.time === selectedTime}
                    className={`slot-chip${slot.time === selectedTime ? " is-selected" : ""}`}
                    onClick={() => onSelect(slot)}
                    type="button"
                  >
                    {slot.time}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function TimeSlotSkeleton() {
  return (
    <div aria-hidden="true" className="slot-groups">
      {[6, 4].map((count, groupIndex) => (
        <div className="slot-group" key={groupIndex}>
          <span className="slot-group__label-skeleton booking-skeleton" />
          <ul className="slot-grid">
            {Array.from({ length: count }, (_, index) => (
              <li key={index}>
                <span className="slot-chip slot-chip--skeleton booking-skeleton" />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
