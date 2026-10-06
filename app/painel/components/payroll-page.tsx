"use client";

import { useCallback, useMemo, useState } from "react";
import { CircleAlert } from "lucide-react";
import useAsyncData from "../../components/use-async-data";
import { getTodayIso } from "../../data/booking";
import {
  formatFullDate,
  formatPeriodLabel,
  getHistoryStart,
  getPeriodRange,
  shiftPeriod,
  summarizeByBarber,
  type Period,
} from "../../data/painel";
import { fetchAppointments, PainelApiError } from "../lib/painel-api";
import DateNav from "./date-nav";
import PayrollSummary from "./payroll-summary";

const stepLabels: Record<Period, { previous: string; next: string }> = {
  dia: { previous: "Dia anterior", next: "Próximo dia" },
  semana: { previous: "Semana anterior", next: "Próxima semana" },
  mes: { previous: "Mês anterior", next: "Próximo mês" },
};

function getErrorMessage(error: unknown) {
  return error instanceof PainelApiError ? error.message : "Não foi possível falar com o banco. Tente novamente.";
}

/** Fechamento: repasse da equipe no dia, na semana ou no mês da data escolhida. */
export default function PayrollPage() {
  const today = getTodayIso();
  const minDate = getHistoryStart(today);
  const [selectedDate, setSelectedDate] = useState(today);
  const [period, setPeriod] = useState<Period>("semana");

  const { start, end } = getPeriodRange(selectedDate, period);
  const loader = useCallback(() => fetchAppointments({ start, end }), [start, end]);
  const loaded = useAsyncData(loader);
  const appointments = loaded.status === "success" ? loaded.data : null;
  const summaries = useMemo(() => summarizeByBarber(appointments ?? []), [appointments]);
  const periodLabel = formatPeriodLabel(selectedDate, period);

  return (
    <main className="admin-main">
      <div className="admin-toolbar">
        <div>
          <h1>{periodLabel}</h1>
          <p>
            Fechamento da equipe. Histórico desde {formatFullDate(minDate)}
            {start < minDate ? `: o período começa antes, os dados valem a partir dessa data.` : "."}
          </p>
        </div>

        <DateNav
          max={today}
          min={minDate}
          nextLabel={stepLabels[period].next}
          onChange={setSelectedDate}
          previousLabel={stepLabels[period].previous}
          step={(date, direction) => shiftPeriod(date, period, direction)}
          today={today}
          value={selectedDate}
        />
      </div>

      {loaded.status === "error" ? (
        <div className="admin-panel">
          <div className="admin-empty">
            <CircleAlert aria-hidden="true" size={22} strokeWidth={1.6} />
            <p className="admin-empty__title">Não foi possível carregar o fechamento</p>
            <p>{getErrorMessage(loaded.error)}</p>
            <button className="admin-text-button" onClick={loaded.retry} type="button">
              Tentar de novo
            </button>
          </div>
        </div>
      ) : null}

      <div aria-busy={!appointments} className={appointments ? undefined : "admin-loading"}>
        <PayrollSummary
          onPeriodChange={setPeriod}
          period={period}
          periodLabel={periodLabel}
          summaries={summaries}
        />
      </div>
    </main>
  );
}
