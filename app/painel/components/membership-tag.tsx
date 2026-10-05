import type { MembershipStatus } from "../../data/painel";

export const membershipLabels: Record<MembershipStatus, string> = {
  ativo: "Assinante ativo",
  pendente: "Pagamento pendente",
  atrasado: "Pagamento atrasado",
  congelado: "Plano congelado",
  ex_assinante: "Ex-assinante",
  avulso: "Avulso",
};

const tagModifiers: Record<MembershipStatus, string> = {
  ativo: "plan",
  pendente: "pending",
  atrasado: "overdue",
  congelado: "frozen",
  ex_assinante: "former",
  avulso: "walkin",
};

/** Tem assinatura vigente, em dia ou não (congelada inclusive). */
export function isSubscriber(status: MembershipStatus) {
  return status === "ativo" || status === "pendente" || status === "atrasado" || status === "congelado";
}

export default function MembershipTag({ status, planName }: { status: MembershipStatus; planName?: string }) {
  const label =
    status === "ativo" && planName
      ? `Assinante · ${planName}`
      : status === "congelado" && planName
        ? `${planName} congelado`
        : membershipLabels[status];
  return <span className={`admin-tag admin-tag--${tagModifiers[status]}`}>{label}</span>;
}
