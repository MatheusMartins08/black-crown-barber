import type { CSSProperties } from "react";
import { formatCurrency, serviceNames, type BarberSummary } from "../../data/painel";
import { barbers } from "../../data/site";
import BarberAvatar from "./barber-avatar";

export default function BarberProduction({ summaries }: { summaries: BarberSummary[] }) {
  const maxServiceCount = Math.max(
    1,
    ...summaries.flatMap((summary) => serviceNames.map((name) => summary.byService[name])),
  );

  return (
    <section aria-labelledby="producao-title" className="admin-panel admin-production" id="producao">
      <div className="admin-panel__heading">
        <div>
          <h2 id="producao-title">Produção do dia</h2>
          <p>Conta quem executou o serviço, apenas atendimentos concluídos.</p>
        </div>
      </div>

      <ol className="admin-production__list">
        {summaries.map((summary) => {
          const specialty = barbers.find((barber) => barber.name === summary.barberName)?.specialty;
          const planShare = summary.completed ? (summary.planCount / summary.completed) * 100 : 0;

          return (
            <li className="admin-barber" key={summary.barberName}>
              <div className="admin-barber__identity">
                <BarberAvatar name={summary.barberName} size={44} />
                <div>
                  <h3>{summary.barberName}</h3>
                  <p>{specialty}</p>
                </div>
                <p className="admin-barber__count">
                  <strong>{summary.completed}</strong>
                  <span>de {summary.booked} marcados</span>
                </p>
              </div>

              <dl className="admin-bars">
                {serviceNames.map((name) => {
                  const count = summary.byService[name];
                  return (
                    <div className="admin-bars__row" key={name}>
                      <dt>{name}</dt>
                      <dd>
                        <span className="admin-bars__track" aria-hidden="true">
                          <span
                            className="admin-bars__fill"
                            style={{ "--bar-scale": count / maxServiceCount } as CSSProperties}
                          />
                        </span>
                        <span className="admin-bars__value">{count}</span>
                      </dd>
                    </div>
                  );
                })}
              </dl>

              <div className="admin-split">
                <span className="admin-split__track" aria-hidden="true">
                  {summary.completed ? (
                    <>
                      <span className="admin-split__plan" style={{ width: `${planShare}%` }} />
                      <span className="admin-split__walkin" style={{ width: `${100 - planShare}%` }} />
                    </>
                  ) : null}
                </span>
                <p className="admin-split__legend">
                  <span>
                    <i className="admin-swatch admin-swatch--plan" aria-hidden="true" />
                    {summary.planCount} {summary.planCount === 1 ? "assinante" : "assinantes"}
                  </span>
                  <span>
                    <i className="admin-swatch admin-swatch--walkin" aria-hidden="true" />
                    {summary.walkInCount} {summary.walkInCount === 1 ? "avulso" : "avulsos"}
                  </span>
                  <span className="admin-split__payout">{formatCurrency(summary.total)} a repassar</span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
