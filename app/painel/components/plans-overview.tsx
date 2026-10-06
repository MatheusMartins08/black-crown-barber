import {
  formatCurrency,
  formatMonth,
  getPlanByName,
  isCoveredByPlan,
  subscriptionPlans,
  type Appointment,
  type ClientProfile,
  type MonthPayment,
} from "../../data/painel";
import { formatPerWeek } from "../../data/plans";
import { isSubscriber } from "./membership-tag";

export default function PlansOverview({
  appointments,
  date,
  monthPayments,
  periodLabel,
  profiles,
}: {
  appointments: Appointment[];
  /** Data selecionada: define o mês das mensalidades. */
  date: string;
  monthPayments: MonthPayment[];
  periodLabel: string;
  /** Situação de hoje de cada cliente. */
  profiles: ClientProfile[];
}) {
  const completed = appointments.filter((appointment) => appointment.status === "concluido");
  const nonSubscribers = profiles.filter((profile) => !isSubscriber(profile.membership)).length;
  const monthLabel = formatMonth(date);

  return (
    <section aria-labelledby="planos-title" className="admin-panel admin-plans" id="planos">
      <div className="admin-panel__heading">
        <div>
          <h2 id="planos-title">Planos de assinatura</h2>
          <p>
            Uso no período: {periodLabel.toLowerCase()}. Mensalidades de {monthLabel}. {nonSubscribers} clientes da
            base não têm plano vigente.
          </p>
        </div>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table admin-table--plans">
          <thead>
            <tr>
              <th scope="col">Plano</th>
              <th scope="col">Cobre</th>
              <th className="is-numeric" scope="col">Mensalidade</th>
              <th className="is-numeric" scope="col">Em dia</th>
              <th className="is-numeric" scope="col">Pendentes</th>
              <th className="is-numeric" scope="col">Congelados</th>
              <th className="is-numeric" scope="col">Usos no período</th>
              <th className="is-numeric" scope="col">Recebido no mês</th>
            </tr>
          </thead>
          <tbody>
            {subscriptionPlans.map((plan) => {
              const planClients = profiles.filter(
                (profile) => profile.planId === plan.id && isSubscriber(profile.membership),
              );
              const upToDate = planClients.filter((profile) => profile.membership === "ativo").length;
              const frozen = planClients.filter((profile) => profile.membership === "congelado").length;
              const pending = planClients.length - upToDate - frozen;
              const uses = completed.filter(
                (appointment) => getPlanByName(appointment.planName)?.id === plan.id && isCoveredByPlan(appointment),
              ).length;
              const planPayments = monthPayments.filter(
                (payment) => payment.planId === plan.id && payment.status !== "cancelado",
              );
              const expected = planPayments.reduce((sum, payment) => sum + payment.amount, 0);
              const received = planPayments
                .filter((payment) => payment.status === "pago")
                .reduce((sum, payment) => sum + payment.amount, 0);

              return (
                <tr key={plan.id}>
                  <th scope="row">{plan.name}</th>
                  <td data-label="Cobre">
                    {plan.covers
                      .map((serviceName, index) => `${serviceName} (${formatPerWeek(plan.benefits[index].perWeek)})`)
                      .join(", ")}
                  </td>
                  <td className="is-numeric" data-label="Mensalidade">
                    {formatCurrency(plan.monthlyPrice)}
                  </td>
                  <td className="is-numeric" data-label="Em dia">
                    {upToDate}
                  </td>
                  <td className="is-numeric" data-label="Pendentes">
                    {pending}
                  </td>
                  <td className="is-numeric" data-label="Congelados">
                    {frozen}
                  </td>
                  <td className="is-numeric" data-label="Usos no período">
                    {uses}
                  </td>
                  <td className="is-numeric is-strong" data-label="Recebido no mês">
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
    </section>
  );
}
