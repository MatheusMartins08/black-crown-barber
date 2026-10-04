import {
  clients,
  formatCurrency,
  getClient,
  isCoveredByPlan,
  subscriptionPlans,
  type Appointment,
} from "../../data/painel";

export default function PlansOverview({
  appointments,
  periodLabel,
}: {
  appointments: Appointment[];
  periodLabel: string;
}) {
  const completed = appointments.filter((appointment) => appointment.status === "concluido");
  const walkInClients = clients.filter((client) => client.planId === null).length;

  return (
    <section aria-labelledby="planos-title" className="admin-panel admin-plans" id="planos">
      <div className="admin-panel__heading">
        <div>
          <h2 id="planos-title">Planos de assinatura</h2>
          <p>
            Uso no período: {periodLabel.toLowerCase()}. {walkInClients} clientes da base ainda não
            são assinantes.
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
              <th className="is-numeric" scope="col">Assinantes</th>
              <th className="is-numeric" scope="col">Usos no período</th>
              <th className="is-numeric" scope="col">Receita mensal</th>
            </tr>
          </thead>
          <tbody>
            {subscriptionPlans.map((plan) => {
              const subscribers = clients.filter((client) => client.planId === plan.id).length;
              const uses = completed.filter(
                (appointment) =>
                  getClient(appointment.clientId).planId === plan.id && isCoveredByPlan(appointment),
              ).length;

              return (
                <tr key={plan.id}>
                  <th scope="row">{plan.name}</th>
                  <td data-label="Cobre">{plan.covers.join(", ")}</td>
                  <td className="is-numeric" data-label="Mensalidade">
                    {formatCurrency(plan.monthlyPrice)}
                  </td>
                  <td className="is-numeric" data-label="Assinantes">
                    {subscribers}
                  </td>
                  <td className="is-numeric" data-label="Usos no período">
                    {uses}
                  </td>
                  <td className="is-numeric is-strong" data-label="Receita mensal">
                    {formatCurrency(plan.monthlyPrice * subscribers)}
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
