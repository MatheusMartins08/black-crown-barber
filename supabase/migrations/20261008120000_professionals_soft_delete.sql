-- Edição do site (ajuste da etapa 2): excluir barbeiro com histórico.
--
-- appointments aponta para professionals com "on delete restrict": apagar a linha de quem
-- já atendeu apagaria o vínculo do histórico. A exclusão desses vira lógica: a linha fica,
-- com deleted_at preenchido e is_active = false. Some do site, do agendamento (as RPCs e a
-- RLS do visitante já exigem is_active) e das listas do painel; continua nos atendimentos
-- e no fechamento dos períodos em que atendeu. Quem nunca atendeu segue sendo apagado de
-- verdade pelo painel.
--
-- Aditivo: só uma coluna nova (nula nas linhas atuais) e um check.

alter table public.professionals
  add column deleted_at timestamptz,
  add constraint professionals_deleted_inactive_check check (deleted_at is null or not is_active);

comment on column public.professionals.deleted_at is
  'Excluído pelo painel (fica só para o histórico). Nulo = cadastro em uso, ativo ou inativo.';
