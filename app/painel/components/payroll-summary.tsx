import { Download } from "lucide-react";
import {
  commissionRules,
  formatCurrency,
  serviceNames,
  type BarberSummary,
  type Period,
} from "../../data/painel";
import BarberAvatar from "./barber-avatar";

const periodOptions: { value: Period; label: string }[] = [
  { value: "dia", label: "Dia" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mês" },
];

type PayrollSummaryProps = {
  period: Period;
  periodLabel: string;
  summaries: BarberSummary[];
  onPeriodChange: (period: Period) => void;
};

function downloadCsv(summaries: BarberSummary[], periodLabel: string) {
  const header = ["Profissional", ...serviceNames, "Atendidos", "Assinantes", "Repasse planos", "Avulsos", "Comissão avulsos", "Total"];
  const rows = summaries.map((summary) => [
    summary.barberName,
    ...serviceNames.map((name) => summary.byService[name]),
    summary.completed,
    summary.planCount,
    summary.planPayout.toFixed(2),
    summary.walkInCount,
    summary.walkInPayout.toFixed(2),
    summary.total.toFixed(2),
  ]);
  const csv = [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `fechamento-${periodLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function PayrollSummary({ period, periodLabel, summaries, onPeriodChange }: PayrollSummaryProps) {
  const totals = summaries.reduce(
    (sum, summary) => ({
      completed: sum.completed + summary.completed,
      planCount: sum.planCount + summary.planCount,
      planPayout: sum.planPayout + summary.planPayout,
      walkInCount: sum.walkInCount + summary.walkInCount,
      walkInPayout: sum.walkInPayout + summary.walkInPayout,
      total: sum.total + summary.total,
      byService: serviceNames.map((name, index) => (sum.byService[index] ?? 0) + summary.byService[name]),
    }),
    { completed: 0, planCount: 0, planPayout: 0, walkInCount: 0, walkInPayout: 0, total: 0, byService: [] as number[] },
  );

  return (
    <section aria-labelledby="fechamento-title" className="admin-panel admin-payroll" id="fechamento">
      <div className="admin-panel__heading admin-panel__heading--split">
        <div>
          <h2 id="fechamento-title">Fechamento para salários</h2>
          <p>Base de cálculo: atendimentos concluídos por quem executou.</p>
        </div>
        <div className="admin-payroll__actions">
          <div className="admin-segmented" role="radiogroup" aria-label="Período do fechamento">
            {periodOptions.map((option) => (
              <button
                aria-checked={period === option.value}
                className={period === option.value ? "is-active" : undefined}
                key={option.value}
                onClick={() => onPeriodChange(option.value)}
                role="radio"
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            className="button button--compact admin-export"
            onClick={() => downloadCsv(summaries, periodLabel)}
            type="button"
          >
            <Download aria-hidden="true" size={15} />
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table admin-table--payroll">
          <thead>
            <tr>
              <th scope="col">Profissional</th>
              {serviceNames.map((name) => (
                <th className="is-numeric" key={name} scope="col">
                  {name}
                </th>
              ))}
              <th className="is-numeric" scope="col">Atendidos</th>
              <th className="is-numeric" scope="col">Planos</th>
              <th className="is-numeric" scope="col">Avulsos</th>
              <th className="is-numeric" scope="col">Total a pagar</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((summary) => (
              <tr key={summary.barberName}>
                <th scope="row">
                  <span className="admin-person">
                    <BarberAvatar name={summary.barberName} />
                    {summary.barberName}
                  </span>
                </th>
                {serviceNames.map((name) => (
                  <td className="is-numeric admin-payroll__service" data-label={name} key={name}>
                    {summary.byService[name]}
                  </td>
                ))}
                <td className="is-numeric is-strong admin-payroll__completed" data-label="Atendidos">
                  {summary.completed}
                </td>
                <td className="is-numeric admin-payroll__plans" data-label="Planos">
                  <span className="admin-money">{formatCurrency(summary.planPayout)}</span>
                  <span className="admin-money__detail">{summary.planCount} atend.</span>
                </td>
                <td className="is-numeric admin-payroll__walkin" data-label="Avulsos">
                  <span className="admin-money">{formatCurrency(summary.walkInPayout)}</span>
                  <span className="admin-money__detail">{summary.walkInCount} atend.</span>
                </td>
                <td className="is-numeric is-total" data-label="Total a pagar">
                  {formatCurrency(summary.total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Equipe</th>
              {totals.byService.map((count, index) => (
                <td className="is-numeric admin-payroll__service" data-label={serviceNames[index]} key={serviceNames[index]}>
                  {count}
                </td>
              ))}
              <td className="is-numeric is-strong admin-payroll__completed" data-label="Atendidos">
                {totals.completed}
              </td>
              <td className="is-numeric admin-payroll__plans" data-label="Planos">
                <span className="admin-money">{formatCurrency(totals.planPayout)}</span>
                <span className="admin-money__detail">{totals.planCount} atend.</span>
              </td>
              <td className="is-numeric admin-payroll__walkin" data-label="Avulsos">
                <span className="admin-money">{formatCurrency(totals.walkInPayout)}</span>
                <span className="admin-money__detail">{totals.walkInCount} atend.</span>
              </td>
              <td className="is-numeric is-total" data-label="Total a pagar">
                {formatCurrency(totals.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Valores de payroll_settings e service_payouts no Supabase (espelhados em commissionRules). */}
      <p className="admin-footnote">
        Regras de repasse: avulsos rendem {commissionRules.walkInRate * 100}% do valor do serviço ao
        profissional; atendimentos cobertos por plano têm repasse fixo (
        {serviceNames
          .map((name) => `${name} ${formatCurrency(commissionRules.planPayout[name])}`)
          .join(" · ")}
        ).
      </p>
    </section>
  );
}
