"use client";

import { useCallback } from "react";
import { CircleAlert, RotateCw } from "lucide-react";
import useAsyncData from "../../components/use-async-data";
import {
  billingRules,
  formatCurrency,
  formatMonth,
  formatMonthTitle,
  getPeriodRange,
  getPlanByName,
  isCoveredByPlan,
  listHistoryMonths,
  type ClientProfile,
} from "../../data/painel";
import { formatFrequency } from "../../data/plans";
import { fetchAppointments, fetchMonthPayments, PainelApiError } from "../lib/painel-api";
import { isSubscriber } from "./membership-tag";
import { usePainelPlans, usePainelServices } from "./painel-catalog";

function getErrorMessage(error: unknown) {
  return error instanceof PainelApiError ? error.message : "Não foi possível falar com o banco. Tente novamente.";
}

export default function PlansOverview({
  today,
  month,
  profiles,
  onMonthChange,
}: {
  today: string;
  /** Mês (YYYY-MM) das mensalidades e dos usos. */
  month: string;
  /** Situação de hoje de cada cliente. */
  profiles: ClientProfile[];
  onMonthChange: (month: string) => void;
}) {
  const months = listHistoryMonths(today);
  const services = usePainelServices();
  const serviceName = (slug: string) => services.find((service) => service.slug === slug)?.name ?? slug;

  // Mensalidades com vencimento no mês e atendimentos do mês (para os usos do plano).
  const loader = useCallback(async () => {
    const [monthPayments, appointments] = await Promise.all([
      fetchMonthPayments(month),
      fetchAppointments(getPeriodRange(`${month}-01`, "mes")),
    ]);
    return { monthPayments, appointments };
  }, [month]);
  const loaded = useAsyncData(loader);
  const data = loaded.status === "success" ? loaded.data : null;

  const completed = (data?.appointments ?? []).filter((appointment) => appointment.status === "concluido");
  const monthPayments = data?.monthPayments ?? [];
  const nonSubscribers = profiles.filter((profile) => !isSubscriber(profile.membership)).length;
  const monthLabel = formatMonth(`${month}-01`);
  // Planos em uso e, mesmo excluídos, os que ainda têm assinante ou mensalidade no mês.
  const plans = usePainelPlans().filter(
    (plan) =>
      !plan.deletedAt ||
      profiles.some((profile) => profile.planId === plan.slug) ||
      monthPayments.some((payment) => payment.planId === plan.slug),
  );

  return (
    <section aria-labelledby="planos-title" className="admin-panel admin-plans" id="planos">
      <div className="admin-panel__heading admin-panel__heading--split">
        <div>
          <h2 id="planos-title">Planos de assinatura</h2>
          <p>
            Usos e mensalidades de {monthLabel}. {nonSubscribers} clientes da base não têm plano vigente.
          </p>
        </div>
        <label className="admin-field admin-plans__month">
          <span>Mês</span>
          <select onChange={(event) => onMonthChange(event.target.value)} value={month}>
            {months.map((option) => (
              <option key={option} value={option}>
                {formatMonthTitle(option)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loaded.status === "error" ? (
        <div className="admin-empty" role="alert">
          <CircleAlert aria-hidden="true" size={22} strokeWidth={1.6} />
          <p className="admin-empty__title">Não foi possível carregar o mês</p>
          <p>{getErrorMessage(loaded.error)}</p>
          <button className="admin-text-button" onClick={loaded.retry} type="button">
            <RotateCw aria-hidden="true" size={13} /> Tentar novamente
          </button>
        </div>
      ) : (
        <div aria-busy={!data} className={`admin-table-wrap${data ? "" : " admin-loading"}`}>
          <table className="admin-table admin-table--plans">
            <thead>
              <tr>
                <th scope="col">Plano</th>
                <th scope="col">Cobre</th>
                <th className="is-numeric" scope="col">Mensalidade</th>
                <th className="is-numeric" scope="col">Em dia</th>
                <th className="is-numeric" scope="col">Pendentes</th>
                <th className="is-numeric" scope="col">Congelados</th>
                <th className="is-numeric" scope="col">Usos no mês</th>
                <th className="is-numeric" scope="col">Recebido no mês</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const planClients = profiles.filter(
                  (profile) => profile.planId === plan.slug && isSubscriber(profile.membership),
                );
                const upToDate = planClients.filter((profile) => profile.membership === "ativo").length;
                const frozen = planClients.filter((profile) => profile.membership === "congelado").length;
                const pending = planClients.length - upToDate - frozen;
                const uses = completed.filter(
                  (appointment) => getPlanByName(plans, appointment.planName)?.id === plan.id && isCoveredByPlan(appointment),
                ).length;
                const planPayments = monthPayments.filter(
                  (payment) => payment.planId === plan.slug && payment.status !== "cancelado",
                );
                const expected = planPayments.reduce((sum, payment) => sum + payment.amount, 0);
                const received = planPayments
                  .filter((payment) => payment.status === "pago")
                  .reduce((sum, payment) => sum + payment.amount, 0);

                return (
                  <tr key={plan.id}>
                    <th scope="row">{plan.name}</th>
                    <td className="admin-plans__covers" data-label="Cobre">
                      {plan.benefits
                        .map((benefit) => `${serviceName(benefit.serviceId)} (${formatFrequency(benefit)})`)
                        .join(", ")}
                    </td>
                    <td className="is-numeric admin-plans__price" data-label="Mensalidade">
                      {formatCurrency(plan.monthlyPrice)}
                    </td>
                    <td className="is-numeric admin-plans__stat" data-label="Em dia">
                      {upToDate}
                    </td>
                    <td className="is-numeric admin-plans__stat" data-label="Pendentes">
                      {pending}
                    </td>
                    <td className="is-numeric admin-plans__stat" data-label="Congelados">
                      {frozen}
                    </td>
                    <td className="is-numeric admin-plans__uses" data-label="Usos no mês">
                      {uses}
                    </td>
                    <td className="is-numeric is-strong admin-plans__received" data-label="Recebido no mês">
                      {formatCurrency(received)}
                      {received < expected ? (
                        <span className="admin-row__price">de {formatCurrency(expected)} previstos</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="admin-footnote">
        Em dia, pendentes e congelados mostram a situação de hoje. Cada benefício vale por semana (segunda a domingo) ou
        por mês (o ciclo da mensalidade), conforme o plano; faltas e cancelamentos liberam o uso. A mensalidade vence no início de cada mês do plano e, depois de{" "}
        {billingRules.graceDays} dias em aberto, o plano deixa de cobrir. Para trocar o plano de um cliente, use a aba
        Assinantes.
      </p>
    </section>
  );
}
