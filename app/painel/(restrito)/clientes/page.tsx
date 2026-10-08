import type { Metadata } from "next";
import ClientsWorkspace from "../../components/clients-workspace";
import { requireStaff } from "../../lib/staff";

export const metadata: Metadata = {
  title: "Clientes | Painel Black Crown Barber",
};

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // O layout confere o papel, mas não roda de novo a cada navegação: a página confere também.
  if (!(await requireStaff("admin"))) return null;

  // ?aba=assinantes ou ?aba=planos abre direto na aba (o componente valida o valor).
  const { aba } = await searchParams;
  return <ClientsWorkspace initialTab={typeof aba === "string" ? aba : undefined} />;
}
