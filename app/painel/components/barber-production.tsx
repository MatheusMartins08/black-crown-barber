import type { CSSProperties } from "react";
import { formatCurrency, type BarberSummary, type TeamBarberSummary } from "../../data/painel";
import type { Service } from "../../data/services";
import BarberAvatar from "./barber-avatar";

/**
 * `services`: colunas do dia (ativos e os que aparecem nos atendimentos, ver listServicesFor).
 * Com BarberSummary (admin) mostra plano × avulso e o repasse; com TeamBarberSummary (painel dos
 * barbeiros) só as quantidades.
 */
export default function BarberProduction({
  summaries,
  services,
}: {
  summaries: readonly (BarberSummary | TeamBarberSummary)[];
  services: Service[];
}) {
  const maxServiceCount = Math.max(
    1,
    ...summaries.flatMap((summary) => services.map((service) => summary.byService[service.id] ?? 0)),
  );

  return (
    <section aria-labelledby="producao-title" className="admin-panel admin-production" id="producao">
      <div className="admin-panel__heading">
        <div>
          <h2 id="producao-title">Produção do dia</h2>
          <p>Conta quem executou o serviço, apenas atendimentos concluídos. Cada serviço de um atendimento conta nas barras.</p>
        </div>
      </div>

      <ol className="admin-production__list">
        {summaries.map((summary) => (
          <li className="admin-barber" key={summary.professionalId}>
            <div className="admin-barber__identity">
              <BarberAvatar professionalId={summary.professionalId} size={44} />
              <div>
                <h3>{summary.barberName}</h3>
                <p>{summary.specialty}</p>
              </div>
              <p className="admin-barber__count">
                <strong>{summary.completed}</strong>
                <span>de {summary.booked} marcados</span>
              </p>
            </div>

            <dl className="admin-bars">
              {services.map((service) => {
                const count = summary.byService[service.id] ?? 0;
                return (
                  <div className="admin-bars__row" key={service.id}>
                    <dt>{service.name}</dt>
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

            {"total" in summary ? <PlanSplit summary={summary} /> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Plano × avulso por serviço feito e o repasse (só no painel do admin). */
function PlanSplit({ summary }: { summary: BarberSummary }) {
  // Um atendimento pode ter serviços dos dois tipos.
  const servicesDone = summary.planCount + summary.walkInCount;
  const planShare = servicesDone ? (summary.planCount / servicesDone) * 100 : 0;

  return (
    <div className="admin-split">
      <span className="admin-split__track" aria-hidden="true">
        {servicesDone ? (
          <>
            <span className="admin-split__plan" style={{ width: `${planShare}%` }} />
            <span className="admin-split__walkin" style={{ width: `${100 - planShare}%` }} />
          </>
        ) : null}
      </span>
      <p className="admin-split__legend">
        <span>
          <i className="admin-swatch admin-swatch--plan" aria-hidden="true" />
          {summary.planCount} no plano
        </span>
        <span>
          <i className="admin-swatch admin-swatch--walkin" aria-hidden="true" />
          {summary.walkInCount} {summary.walkInCount === 1 ? "avulso" : "avulsos"}
        </span>
        <span className="admin-split__payout">{formatCurrency(summary.total)} a repassar</span>
      </p>
    </div>
  );
}
