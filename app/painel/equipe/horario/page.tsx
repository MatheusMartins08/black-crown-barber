import type { Metadata } from "next";
import { getFirstName } from "../../../data/professionals";
import NoAccess from "../../components/no-access";
import SiteHours from "../../components/site-hours";
import { getStaffProfessionals, requireStaff } from "../../lib/staff";

export const metadata: Metadata = {
  title: "Meu horário | Painel dos barbeiros",
};

// Meu horário: a mesma tela de Edição do site > Horários, sempre no profissional do login. O
// id vem da sessão (staff_members.professional_id), nunca da URL; as ações e a RLS conferem.
export default async function MeuHorarioPage() {
  const current = await requireStaff("barbeiro");
  if (!current) return null;

  const professional = (await getStaffProfessionals()).find((item) => item.id === current.staff.professionalId);
  if (!professional) {
    return (
      <NoAccess
        title="Cadastro não encontrado"
        message="Seu login não está ligado a um barbeiro ativo. Fale com o administrador."
      />
    );
  }

  return (
    <main className="admin-main">
      <div className="admin-toolbar">
        <div>
          <h1>Meu horário — {getFirstName(professional.name)}</h1>
          <p>Dias e horários em que você atende. O agendamento online passa a seguir o que você salvar aqui.</p>
        </div>
      </div>
      <SiteHours scope={{ professionalId: professional.id, name: professional.name, self: true }} />
    </main>
  );
}
