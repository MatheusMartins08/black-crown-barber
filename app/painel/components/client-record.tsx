"use client";

import { useCallback, useId, useState } from "react";
import { CalendarPlus, CircleAlert, LoaderCircle, RotateCw, X } from "lucide-react";
import Dialog from "../../components/dialog";
import useAsyncData from "../../components/use-async-data";
import { summarizeClientHistory } from "../../data/client-record";
import { getShopToday } from "../../data/shop";
import {
  formatCurrency,
  formatFullDate,
  getServicePrice,
  historyRules,
  isCoveredByPlan,
  type Appointment,
  type ClientProfile,
} from "../../data/painel";
import { fetchClientRecord, PainelApiError } from "../lib/painel-api";
import { statusOptions } from "./appointments-table";
import MembershipTag from "./membership-tag";
import { usePainelTimezone } from "./painel-catalog";

// Ficha do cliente (Clientes > nome do cliente): cadastro, números, preferências e o
// histórico guardado no painel. Só leitura; "Novo horário" abre o formulário da agenda.

const historyPageSize = 10;

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof PainelApiError ? error.message : "Não foi possível falar com o banco. Tente novamente.";
}

/** Valor da linha do histórico: cobrado (concluído), a cobrar (agendado) ou nada. */
function getAmount(appointment: Appointment) {
  if (appointment.status === "cancelado" || appointment.status === "faltou") return "—";
  if (isCoveredByPlan(appointment)) return "Plano";
  const amount = formatCurrency(getServicePrice(appointment));
  return appointment.status === "concluido" ? amount : `${amount} a cobrar`;
}

function ClientRecordContent({
  profile,
  titleId,
  onClose,
  onBook,
}: {
  profile: ClientProfile;
  titleId: string;
  onClose: () => void;
  onBook: () => void;
}) {
  const timezone = usePainelTimezone();
  const loader = useCallback(() => fetchClientRecord(profile.id), [profile.id]);
  const loaded = useAsyncData(loader);
  const [shown, setShown] = useState(historyPageSize);

  const record = loaded.status === "success" ? loaded.data : null;
  const summary = record ? summarizeClientHistory(record.appointments, getShopToday(timezone)) : null;

  return (
    <div className="admin-dialog__panel">
      <header className="admin-dialog__header">
        <div>
          <h2 id={titleId}>{profile.name}</h2>
          <p className="admin-record__meta">
            <MembershipTag planName={profile.planName ?? undefined} status={profile.membership} />
            <span>{profile.phone}</span>
            {record?.email ? <span>{record.email}</span> : null}
            {record ? <span>Cliente desde {formatFullDate(getShopToday(timezone, new Date(record.createdAt)))}</span> : null}
          </p>
        </div>
        <button aria-label="Fechar" className="admin-icon-button" onClick={onClose} type="button">
          <X aria-hidden="true" size={18} />
        </button>
      </header>

      <div className="admin-dialog__body">
        {loaded.status === "error" ? (
          <div className="admin-empty" role="alert">
            <CircleAlert aria-hidden="true" size={22} strokeWidth={1.6} />
            <p className="admin-empty__title">Não foi possível carregar a ficha</p>
            <p>{getErrorMessage(loaded.error)}</p>
            <button className="admin-text-button" onClick={loaded.retry} type="button">
              <RotateCw aria-hidden="true" size={13} /> Tentar de novo
            </button>
          </div>
        ) : !record || !summary ? (
          <div aria-busy="true" className="admin-empty">
            <LoaderCircle aria-hidden="true" className="admin-spinner" size={22} strokeWidth={1.6} />
            <p className="admin-empty__title">Carregando a ficha…</p>
          </div>
        ) : (
          <>
            {profile.planName ? (
              <p className="admin-record__plan">
                Plano {profile.planName}
                {profile.monthlyPrice !== null ? ` · ${formatCurrency(profile.monthlyPrice)}/mês` : ""}
                {profile.subscribedSince ? ` · assinante desde ${formatFullDate(profile.subscribedSince)}` : ""}
                {profile.openAmount > 0 ? ` · ${formatCurrency(profile.openAmount)} em aberto` : ""}
              </p>
            ) : null}

            <dl aria-label={`Resumo dos últimos ${historyRules.months} meses`} className="admin-record__stats">
              <div>
                <dt>Visitas</dt>
                <dd>{summary.visits}</dd>
              </div>
              <div>
                <dt>Total pago</dt>
                <dd>{formatCurrency(summary.spent)}</dd>
              </div>
              <div>
                <dt>Ticket médio</dt>
                <dd>{summary.averageTicket === null ? "—" : formatCurrency(summary.averageTicket)}</dd>
              </div>
              <div>
                <dt>Frequência</dt>
                <dd>{summary.averageInterval === null ? "—" : `a cada ${plural(summary.averageInterval, "dia", "dias")}`}</dd>
              </div>
              <div>
                <dt>Faltas</dt>
                <dd>{summary.noShows}</dd>
              </div>
              <div>
                <dt>Cancelamentos</dt>
                <dd>{summary.cancellations}</dd>
              </div>
            </dl>

            <ul className="admin-record__facts">
              <li>
                <span>Última visita</span>
                {summary.lastVisit
                  ? `${formatFullDate(summary.lastVisit.date)} · ${summary.lastVisit.serviceName} com ${summary.lastVisit.performedBy}`
                  : "Nenhuma no período"}
              </li>
              <li>
                <span>Próximo horário</span>
                {summary.next
                  ? `${formatFullDate(summary.next.date)} às ${summary.next.time} · ${summary.next.serviceName} com ${summary.next.bookedWith}`
                  : "Nenhum agendado"}
              </li>
              <li>
                <span>Profissional preferido</span>
                {summary.favoriteBarber
                  ? `${summary.favoriteBarber.name} (${plural(summary.favoriteBarber.count, "visita", "visitas")})`
                  : "—"}
              </li>
              <li>
                <span>Serviço mais feito</span>
                {summary.favoriteService
                  ? `${summary.favoriteService.name} (${plural(summary.favoriteService.count, "vez", "vezes")})`
                  : "—"}
              </li>
            </ul>

            <section aria-labelledby={`${titleId}-history`} className="admin-record__history">
              <h3 id={`${titleId}-history`}>Histórico</h3>
              {record.appointments.length === 0 ? (
                <p className="admin-field__hint">Nenhum atendimento nos últimos {historyRules.months} meses.</p>
              ) : (
                <>
                  <ol>
                    {record.appointments.slice(0, shown).map((appointment) => {
                      const status = statusOptions.find((option) => option.value === appointment.status)!;
                      return (
                        <li className={`admin-record__visit admin-record__visit--${appointment.status}`} key={appointment.id}>
                          <span className="admin-record__when">
                            {formatFullDate(appointment.date)} · {appointment.time}
                          </span>
                          <span className="admin-record__what">
                            {appointment.serviceName} com {appointment.performedBy}
                          </span>
                          <span className={`admin-record__status admin-record__status--${appointment.status}`}>
                            {status.label}
                          </span>
                          <span className="admin-record__amount">{getAmount(appointment)}</span>
                        </li>
                      );
                    })}
                  </ol>
                  {record.appointments.length > shown ? (
                    <button
                      className="admin-text-button"
                      onClick={() => setShown((current) => current + historyPageSize)}
                      type="button"
                    >
                      Mostrar mais {Math.min(record.appointments.length - shown, historyPageSize)}
                    </button>
                  ) : null}
                </>
              )}
              <p className="admin-field__hint">
                O painel guarda os atendimentos dos últimos {historyRules.months} meses; os números acima contam esse período.
              </p>
            </section>
          </>
        )}
      </div>

      <footer className="admin-dialog__footer">
        <button className="admin-text-button" onClick={onClose} type="button">
          Fechar
        </button>
        <button className="button button--compact admin-action" onClick={onBook} type="button">
          <CalendarPlus aria-hidden="true" size={15} />
          Novo horário
        </button>
      </footer>
    </div>
  );
}

export default function ClientRecordDialog({
  open,
  openKey,
  profile,
  onClose,
  onBook,
}: {
  open: boolean;
  openKey: number;
  profile: ClientProfile | null;
  onClose: () => void;
  /** Fecha a ficha e abre o Novo horário com o telefone do cliente. */
  onBook: (profile: ClientProfile) => void;
}) {
  const titleId = useId();
  return (
    <Dialog className="admin-dialog admin-dialog--record" labelledBy={titleId} onClose={onClose} open={open}>
      {profile ? (
        <ClientRecordContent
          key={openKey}
          onBook={() => onBook(profile)}
          onClose={onClose}
          profile={profile}
          titleId={titleId}
        />
      ) : null}
    </Dialog>
  );
}
