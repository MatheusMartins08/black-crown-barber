import type { Metadata } from "next";
import PayrollPage from "../../components/payroll-page";

export const metadata: Metadata = {
  title: "Fechamento | Painel Black Crown Barber",
};

export default function FechamentoPage() {
  return <PayrollPage />;
}
