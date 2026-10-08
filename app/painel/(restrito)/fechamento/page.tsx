import type { Metadata } from "next";
import PayrollPage from "../../components/payroll-page";
import { requireStaff } from "../../lib/staff";

export const metadata: Metadata = {
  title: "Fechamento | Painel Black Crown Barber",
};

export default async function FechamentoPage() {
  // O layout confere o papel, mas não roda de novo a cada navegação: a página confere também.
  if (!(await requireStaff("admin"))) return null;
  return <PayrollPage />;
}
