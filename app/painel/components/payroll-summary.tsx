import { Download } from "lucide-react";
import { formatCurrency, type BarberSummary, type Period } from "../../data/painel";
import type { Service } from "../../data/services";
import BarberAvatar from "./barber-avatar";
import { useWalkInRate } from "./painel-catalog";

const periodOptions: { value: Period; label: string }[] = [
  { value: "dia", label: "Dia" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mês" },
];

type PayrollSummaryProps = {
  period: Period;
  periodLabel: string;
  summaries: BarberSummary[];
  /** Colunas do período: serviços ativos e os que aparecem nos atendimentos (ver listServicesFor). */
  services: Service[];
  onPeriodChange: (period: Period) => void;
};

function downloadCsv(summaries: BarberSummary[], services: Service[], periodLabel: string) {
  const header = [
    "Profissional",
    ...services.map((service) => service.name),
    "Atendidos",
    "Serviços no plano",
    "Repasse planos",
    "Serviços avulsos",
    "Comissão avulsos",
    "Total",
  ];
  const rows = summaries.map((summary) => [
    summary.barberName,
    ...services.map((service) => summary.byService[service.id] ?? 0),
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

export default function PayrollSummary({ period, periodLabel, summaries, services, onPeriodChange }: PayrollSummaryProps) {
  const walkInRate = useWalkInRate();
  // Regras de repasse do rodapé: só serviços em uso (ativos), com o repasse do plano gravado no banco.
  const payoutRules = services.filter((service) => service.isActive && !service.deletedAt);
  const totals = summaries.reduce(
    (sum, summary) => ({
      completed: sum.completed + summary.completed,
      planCount: sum.planCount + summary.planCount,
      planPayout: sum.planPayout + summary.planPayout,
      walkInCount: sum.walkInCount + summary.walkInCount,
      walkInPayout: sum.walkInPayout + summary.walkInPayout,
      total: sum.total + summary.total,
      byService: services.map((service, index) => (sum.byService[index] ?? 0) + (summary.byService[service.id] ?? 0)),
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
            onClick={() => downloadCsv(summaries, services, periodLabel)}
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
              {services.map((service) => (
                <th className="is-numeric" key={service.id} scope="col">
                  {service.name}
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
              <tr key={summary.professionalId}>
                <th scope="row">
                  <span className="admin-person">
                    <BarberAvatar professionalId={summary.professionalId} />
                    {summary.barberName}
                  </span>
                </th>
                {services.map((service) => (
                  <td className="is-numeric admin-payroll__service" data-label={service.name} key={service.id}>
                    {summary.byService[service.id] ?? 0}
                  </td>
                ))}
                <td className="is-numeric is-strong admin-payroll__completed" data-label="Atendidos">
                  {summary.completed}
                </td>
                <td className="is-numeric admin-payroll__plans" data-label="Planos">
                  <span className="admin-money">{formatCurrency(summary.planPayout)}</span>
                  <span className="admin-money__detail">{summary.planCount} serv.</span>
                </td>
                <td className="is-numeric admin-payroll__walkin" data-label="Avulsos">
                  <span className="admin-money">{formatCurrency(summary.walkInPayout)}</span>
                  <span className="admin-money__detail">{summary.walkInCount} serv.</span>
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
                <td
                  className="is-numeric admin-payroll__service"
                  data-label={services[index]?.name}
                  key={services[index]?.id ?? index}
                >
                  {count}
                </td>
              ))}
              <td className="is-numeric is-strong admin-payroll__completed" data-label="Atendidos">
                {totals.completed}
              </td>
              <td className="is-numeric admin-payroll__plans" data-label="Planos">
                <span className="admin-money">{formatCurrency(totals.planPayout)}</span>
                <span className="admin-money__detail">{totals.planCount} serv.</span>
              </td>
              <td className="is-numeric admin-payroll__walkin" data-label="Avulsos">
                <span className="admin-money">{formatCurrency(totals.walkInPayout)}</span>
                <span className="admin-money__detail">{totals.walkInCount} serv.</span>
              </td>
              <td className="is-numeric is-total" data-label="Total a pagar">
                {formatCurrency(totals.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Valores atuais de payroll_settings e service_payouts no Supabase. Atendimentos concluídos
          guardam o repasse do momento: mudar estas regras não altera o fechamento já feito. */}
      <p className="admin-footnote">
        Atendidos conta clientes (um por atendimento); as colunas de serviço, planos e avulsos contam cada serviço
        feito. Regras de repasse: serviços avulsos rendem {Math.round(walkInRate * 100)}% do valor ao profissional;
        serviços cobertos por plano têm repasse fixo (
        {payoutRules.map((service) => `${service.name} ${formatCurrency(service.planPayout ?? 0)}`).join(" · ")}
        ).
      </p>
    </section>
  );
}
