import {
  clients,
  formatCurrency,
  formatMonth,
  getMembership,
  getSubscriptionOn,
  isCoveredByPlan,
  subscriptions,
  subscriptionPlans,
  type Appointment,
  type PlanPayment,
} from "../../data/painel";
import { formatPerWeek } from "../../data/plans";
import { isSubscriber } from "./membership-tag";

export default function PlansOverview({
  appointments,
  date,
  payments,
  periodLabel,
}: {
  appointments: Appointment[];
  date: string;
  payments: PlanPayment[];
  periodLabel: string;
}) {
  const completed = appointments.filter((appointment) => appointment.status === "concluido");
  const memberships = new Map(clients.map((client) => [client.id, getMembership(client.id, date, payments)]));
  const nonSubscribers = clients.filter((client) => !isSubscriber(memberships.get(client.id)!)).length;
  const month = date.slice(0, 7);
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
              const planClients = clients.filter(
                (client) => getSubscriptionOn(client.id, date)?.planId === plan.id,
              );
              const upToDate = planClients.filter((client) => memberships.get(client.id) === "ativo").length;
              const frozen = planClients.filter((client) => memberships.get(client.id) === "congelado").length;
              const pending = planClients.length - upToDate - frozen;
              const uses = completed.filter(
                (appointment) =>
                  getSubscriptionOn(appointment.clientId, appointment.date)?.planId === plan.id &&
                  isCoveredByPlan(appointment, payments),
              ).length;
              const planSubscriptionIds = new Set(
                subscriptions.filter((subscription) => subscription.planId === plan.id).map((subscription) => subscription.id),
              );
              const monthPayments = payments.filter(
                (payment) => planSubscriptionIds.has(payment.subscriptionId) && payment.dueDate.startsWith(month),
              );
              const expected = monthPayments.reduce((sum, payment) => sum + payment.amount, 0);
              const received = monthPayments
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
